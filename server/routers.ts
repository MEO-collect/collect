import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getMemberProfile, upsertMemberProfile, getSubscription, createSubscription, updateSubscription, deleteSubscription, getAllSubscriptionsWithUsers } from "./db";
import { getStripe } from "./stripe/client";
import { SUBSCRIPTION_PLAN, calculateCancellationFee, isInInitialPeriod } from "./stripe/products";
import { extractSubData, subDataToDbFields } from "./stripe/helpers";
import { TRPCError } from "@trpc/server";
import { voiceRouter } from "./routers/voice";
import { imageRouter } from "./routers/image";
import { bizwriterRouter } from "./routers/bizwriter";
import { shozaiRouter } from "./routers/shozai";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Member Profile Router
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getMemberProfile(ctx.user.id);
      return profile ?? null;
    }),

    upsert: protectedProcedure
      .input(z.object({
        contactName: z.string().min(1, "担当者名は必須です"),
        companyName: z.string().min(1, "会社名/店舗名は必須です"),
        contactEmail: z.string().email("有効なメールアドレスを入力してください"),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertMemberProfile({
          userId: ctx.user.id,
          contactName: input.contactName,
          companyName: input.companyName,
          contactEmail: input.contactEmail,
        });
        return { success: true };
      }),
  }),

  // Subscription Router
  subscription: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const subscription = await getSubscription(ctx.user.id);
      if (!subscription) {
        return null;
      }

      // Check if still in initial period
      const inInitialPeriod = subscription.startedAt 
        ? isInInitialPeriod(subscription.startedAt) 
        : false;

      // Calculate cancellation fee if in initial period
      const cancellationFee = subscription.startedAt && inInitialPeriod
        ? calculateCancellationFee(subscription.startedAt, SUBSCRIPTION_PLAN.priceInYen)
        : 0;

      return {
        ...subscription,
        isInInitialPeriod: inInitialPeriod,
        cancellationFee,
        planName: SUBSCRIPTION_PLAN.name,
        monthlyPrice: SUBSCRIPTION_PLAN.priceInYen,
      };
    }),

    // Verify and sync subscription from Stripe Checkout Session
    // This is a fallback for when webhooks fail or are delayed
    verifySession: protectedProcedure
      .input(z.object({
        sessionId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const stripe = getStripe();
        const userId = ctx.user.id;

        // First check if user already has an active subscription
        const existing = await getSubscription(userId);
        if (existing && existing.status === "active" && existing.stripeSubscriptionId) {
          return { status: "active", synced: false };
        }

        // If we have a session ID, verify it with Stripe
        if (input.sessionId) {
          try {
            const session = await stripe.checkout.sessions.retrieve(input.sessionId);
            console.log("[VerifySession] Session:", session.id, "status:", session.status, "payment_status:", session.payment_status);

            if (session.status === "complete" && session.subscription) {
              const subscriptionId = typeof session.subscription === "string"
                ? session.subscription
                : session.subscription.id;

              const customerId = session.customer
                ? (typeof session.customer === "string" ? session.customer : session.customer.id)
                : null;

              // Get subscription details from Stripe
              const stripeSubResponse = await stripe.subscriptions.retrieve(subscriptionId);
              const subData = extractSubData(stripeSubResponse);
              const dbFields = subDataToDbFields(subData);

              if (existing) {
                // Update existing subscription
                await updateSubscription(userId, {
                  stripeCustomerId: customerId || existing.stripeCustomerId,
                  ...dbFields,
                  status: "active",
                });
                console.log("[VerifySession] Updated subscription for user:", userId);
              } else {
                // Create new subscription
                try {
                  await createSubscription({
                    userId,
                    stripeCustomerId: customerId || undefined,
                    ...dbFields,
                    status: "active",
                  });
                  console.log("[VerifySession] Created new subscription for user:", userId);
                } catch (createError) {
                  // If duplicate key, update instead
                  await updateSubscription(userId, {
                    stripeCustomerId: customerId || undefined,
                    ...dbFields,
                    status: "active",
                  });
                  console.log("[VerifySession] Updated subscription after create failure for user:", userId);
                }
              }
              return { status: "active", synced: true };
            }
          } catch (err) {
            console.error("[VerifySession] Error verifying session:", err);
          }
        }

        // If no session ID, try to sync from Stripe using the customer ID
        if (existing && existing.stripeCustomerId) {
          try {
            // First check for active subscriptions
            const customerSubs = await stripe.subscriptions.list({
              customer: existing.stripeCustomerId,
              limit: 10,
            });

            // Find the best subscription (prefer active, then trialing, then any non-canceled)
            const activeSub = customerSubs.data.find(s => s.status === "active")
              || customerSubs.data.find(s => s.status === "trialing")
              || customerSubs.data.find(s => s.status !== "canceled" && s.status !== "incomplete_expired");

            if (activeSub) {
              const subData = extractSubData(activeSub);
              const dbFields = subDataToDbFields(subData);

              await updateSubscription(userId, dbFields);
              console.log("[VerifySession] Synced subscription from Stripe customer for user:", userId, "status:", subData.status);
              return { status: subData.status, synced: true };
            }
          } catch (err) {
            console.error("[VerifySession] Error checking Stripe customer:", err);
          }
        }

        return { status: existing?.status || "none", synced: false };
      }),

    // syncFromStripe: Comprehensive sync that checks all Stripe data for this user
    syncFromStripe: protectedProcedure.mutation(async ({ ctx }) => {
      const stripe = getStripe();
      const userId = ctx.user.id;
      const existing = await getSubscription(userId);

      if (!existing) {
        return { status: "none", synced: false, message: "サブスクリプションレコードがありません" };
      }

      if (!existing.stripeCustomerId) {
        return { status: existing.status, synced: false, message: "Stripe顧客IDがありません" };
      }

      try {
        // List all subscriptions for this customer from Stripe
        const customerSubs = await stripe.subscriptions.list({
          customer: existing.stripeCustomerId,
          limit: 10,
        });

        console.log("[SyncFromStripe] Found", customerSubs.data.length, "subscriptions for customer:", existing.stripeCustomerId);

        if (customerSubs.data.length === 0) {
          // No subscriptions in Stripe - keep as incomplete
          return { 
            status: existing.status, 
            synced: false, 
            message: "Stripeにサブスクリプションが見つかりません。決済が完了していない可能性があります。",
            stripeSubscriptions: 0,
          };
        }

        // Find the best subscription
        const activeSub = customerSubs.data.find(s => s.status === "active")
          || customerSubs.data.find(s => s.status === "trialing")
          || customerSubs.data[0]; // fallback to most recent

        const subData = extractSubData(activeSub);
        const dbFields = subDataToDbFields(subData);

        await updateSubscription(userId, dbFields);

        console.log("[SyncFromStripe] Updated subscription for user:", userId, "status:", subData.status);
        return { 
          status: subData.status, 
          synced: true, 
          message: `Stripeから同期しました（ステータス: ${subData.status}）`,
          stripeSubscriptions: customerSubs.data.length,
        };
      } catch (err) {
        console.error("[SyncFromStripe] Error:", err);
        return { 
          status: existing.status, 
          synced: false, 
          message: "Stripeとの同期中にエラーが発生しました",
        };
      }
    }),

    createCheckoutSession: protectedProcedure.mutation(async ({ ctx }) => {
      const stripe = getStripe();
      const origin = ctx.req.headers.origin || "http://localhost:3000";

      // Check if user already has an active subscription
      const existingSubscription = await getSubscription(ctx.user.id);
      if (existingSubscription && existingSubscription.status === "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "既にアクティブなサブスクリプションがあります",
        });
      }

      // Reuse existing Stripe customer if available, or create a new one
      let customerId = existingSubscription?.stripeCustomerId;
      
      if (!customerId) {
        // No existing record or no customer ID - create new customer
        const customer = await stripe.customers.create({
          email: ctx.user.email ?? undefined,
          name: ctx.user.name ?? undefined,
          metadata: {
            userId: ctx.user.id.toString(),
          },
        });
        customerId = customer.id;
        console.log("[CreateCheckout] Created new Stripe customer:", customerId, "for user:", ctx.user.id);
      } else {
        console.log("[CreateCheckout] Reusing existing Stripe customer:", customerId, "for user:", ctx.user.id);
        
        // If existing subscription is incomplete/canceled/incomplete_expired, 
        // check if there are any active subscriptions in Stripe first
        if (existingSubscription && (
          existingSubscription.status === "incomplete" || 
          existingSubscription.status === "canceled" || 
          existingSubscription.status === "incomplete_expired"
        )) {
          try {
            const existingSubs = await stripe.subscriptions.list({
              customer: customerId,
              status: "active",
              limit: 1,
            });
            
            if (existingSubs.data.length > 0) {
              // There's already an active subscription in Stripe - sync it
              const subData = extractSubData(existingSubs.data[0]);
              const dbFields = subDataToDbFields(subData);
              
              await updateSubscription(ctx.user.id, {
                ...dbFields,
                status: "active",
              });
              
              console.log("[CreateCheckout] Found active subscription in Stripe, synced:", subData.id);
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "既にアクティブなサブスクリプションがあります。ページを更新してください。",
              });
            }
          } catch (err) {
            if (err instanceof TRPCError) throw err;
            console.error("[CreateCheckout] Error checking existing Stripe subscriptions:", err);
          }
        }
      }

      // Create or update subscription record in DB (incomplete state)
      if (!existingSubscription) {
        await createSubscription({
          userId: ctx.user.id,
          stripeCustomerId: customerId,
          status: "incomplete",
        });
        console.log("[CreateCheckout] Created new subscription record for user:", ctx.user.id);
      } else if (!existingSubscription.stripeCustomerId) {
        // Update existing record with customer ID if it was missing
        await updateSubscription(ctx.user.id, {
          stripeCustomerId: customerId,
        });
      }

      // Create price for the subscription (0 yen for testing)
      const price = await stripe.prices.create({
        currency: "jpy",
        unit_amount: SUBSCRIPTION_PLAN.priceInYen,
        recurring: {
          interval: SUBSCRIPTION_PLAN.interval,
        },
        product_data: {
          name: SUBSCRIPTION_PLAN.name,
        },
      });

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/subscription/cancel`,
        allow_promotion_codes: true,
        client_reference_id: ctx.user.id.toString(),
        metadata: {
          user_id: ctx.user.id.toString(),
          customer_email: ctx.user.email ?? "",
          customer_name: ctx.user.name ?? "",
        },
      });

      console.log("[CreateCheckout] Created checkout session:", session.id, "for user:", ctx.user.id);
      return { url: session.url };
    }),

    cancel: protectedProcedure.mutation(async ({ ctx }) => {
      const subscription = await getSubscription(ctx.user.id);
      if (!subscription) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "サブスクリプションが見つかりません",
        });
      }
      
      if (!subscription.stripeSubscriptionId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "サブスクリプション情報がまだ反映されていません。決済完了後、数分お待ちいただき再度お試しください。",
        });
      }

      // Check if in initial period
      const inInitialPeriod = subscription.startedAt 
        ? isInInitialPeriod(subscription.startedAt) 
        : false;

      if (inInitialPeriod) {
        const cancellationFee = subscription.startedAt
          ? calculateCancellationFee(subscription.startedAt, SUBSCRIPTION_PLAN.priceInYen)
          : 0;

        return {
          requiresConfirmation: true,
          cancellationFee,
          message: `初回契約期間中のため、解約金${cancellationFee.toLocaleString()}円が発生します。`,
        };
      }

      // Cancel subscription in Stripe
      const stripe = getStripe();
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await updateSubscription(ctx.user.id, {
        canceledAt: Date.now(),
      });

      return {
        requiresConfirmation: false,
        cancellationFee: 0,
        message: "サブスクリプションは現在の請求期間の終了時にキャンセルされます。",
      };
    }),

    confirmCancel: protectedProcedure
      .input(z.object({
        acceptCancellationFee: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!input.acceptCancellationFee) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "解約金への同意が必要です",
          });
        }

        const subscription = await getSubscription(ctx.user.id);
        if (!subscription) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "サブスクリプションが見つかりません",
          });
        }
        
        if (!subscription.stripeSubscriptionId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "サブスクリプション情報がまだ反映されていません。決済完了後、数分お待ちいただき再度お試しください。",
          });
        }

        // Cancel subscription immediately in Stripe
        const stripe = getStripe();
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);

        await updateSubscription(ctx.user.id, {
          status: "canceled",
          canceledAt: Date.now(),
        });

        return {
          success: true,
          message: "サブスクリプションが解約されました。",
        };
      }),
  }),

  // Admin Router for subscription management
  admin: router({
    // List all subscriptions with user info
    listSubscriptions: adminProcedure.query(async () => {
      const results = await getAllSubscriptionsWithUsers();
      return results.map(r => ({
        id: r.subscription.id,
        userId: r.subscription.userId,
        userName: r.userName,
        userEmail: r.userEmail,
        stripeCustomerId: r.subscription.stripeCustomerId,
        stripeSubscriptionId: r.subscription.stripeSubscriptionId,
        status: r.subscription.status,
        startedAt: r.subscription.startedAt,
        currentPeriodEnd: r.subscription.currentPeriodEnd,
        canceledAt: r.subscription.canceledAt,
        isInInitialPeriod: r.subscription.isInInitialPeriod,
        createdAt: r.subscription.createdAt,
        updatedAt: r.subscription.updatedAt,
      }));
    }),

    // Sync a specific user's subscription from Stripe
    syncSubscription: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        const stripe = getStripe();
        const existing = await getSubscription(input.userId);
        
        if (!existing) {
          return { success: false, message: "サブスクリプションレコードが見つかりません" };
        }

        if (!existing.stripeCustomerId) {
          return { success: false, message: "Stripe顧客IDがありません" };
        }

        try {
          const customerSubs = await stripe.subscriptions.list({
            customer: existing.stripeCustomerId,
            limit: 10,
          });

          if (customerSubs.data.length === 0) {
            return { success: false, message: "Stripeにサブスクリプションが見つかりません" };
          }

          const activeSub = customerSubs.data.find(s => s.status === "active")
            || customerSubs.data.find(s => s.status === "trialing")
            || customerSubs.data[0];

          const subData = extractSubData(activeSub);
          const dbFields = subDataToDbFields(subData);

          await updateSubscription(input.userId, dbFields);

          return { 
            success: true, 
            message: `同期完了: ${subData.status}`,
            stripeStatus: subData.status,
          };
        } catch (err) {
          console.error("[AdminSync] Error:", err);
          return { success: false, message: "Stripeとの同期中にエラーが発生しました" };
        }
      }),

    // Reset a subscription (delete the record so user can start fresh)
    resetSubscription: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        try {
          await deleteSubscription(input.userId);
          return { success: true, message: "サブスクリプションレコードを削除しました" };
        } catch (err) {
          console.error("[AdminReset] Error:", err);
          return { success: false, message: "削除に失敗しました" };
        }
      }),

    // Force update subscription status
    forceUpdateStatus: adminProcedure
      .input(z.object({
        userId: z.number(),
        status: z.enum(["active", "canceled", "past_due", "trialing", "incomplete", "incomplete_expired", "unpaid"]),
      }))
      .mutation(async ({ input }) => {
        try {
          await updateSubscription(input.userId, {
            status: input.status,
          });
          return { success: true, message: `ステータスを${input.status}に更新しました` };
        } catch (err) {
          console.error("[AdminForceUpdate] Error:", err);
          return { success: false, message: "更新に失敗しました" };
        }
      }),
  }),

  // Voice transcription router
  voice: voiceRouter,

  // Image editing router
  image: imageRouter,

  // BizWriter AI router
  bizwriter: bizwriterRouter,

  // 商材ドクター router
  shozai: shozaiRouter,
});

export type AppRouter = typeof appRouter;
