import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getMemberProfile, upsertMemberProfile, getSubscription, createSubscription, updateSubscription } from "./db";
import { getStripe } from "./stripe/client";
import { SUBSCRIPTION_PLAN, calculateCancellationFee, isInInitialPeriod } from "./stripe/products";
import { TRPCError } from "@trpc/server";
import { voiceRouter } from "./routers/voice";
import { imageRouter } from "./routers/image";

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
              const stripeSub = stripeSubResponse as unknown as { id: string; start_date: number; current_period_end: number; status: string };
              const startedAt = stripeSub.start_date * 1000;
              const initialPeriodEndsAt = startedAt + (SUBSCRIPTION_PLAN.initialPeriodMonths * 30 * 24 * 60 * 60 * 1000);

              if (existing) {
                // Update existing subscription
                await updateSubscription(userId, {
                  stripeCustomerId: customerId || existing.stripeCustomerId,
                  stripeSubscriptionId: subscriptionId,
                  status: "active",
                  startedAt,
                  initialPeriodEndsAt,
                  isInInitialPeriod: true,
                  currentPeriodEnd: stripeSub.current_period_end * 1000,
                });
                console.log("[VerifySession] Updated subscription for user:", userId);
              } else {
                // Create new subscription
                try {
                  await createSubscription({
                    userId,
                    stripeCustomerId: customerId || undefined,
                    stripeSubscriptionId: subscriptionId,
                    status: "active",
                    startedAt,
                    initialPeriodEndsAt,
                    isInInitialPeriod: true,
                    currentPeriodEnd: stripeSub.current_period_end * 1000,
                  });
                  console.log("[VerifySession] Created new subscription for user:", userId);
                } catch (createError) {
                  // If duplicate key, update instead
                  await updateSubscription(userId, {
                    stripeCustomerId: customerId || undefined,
                    stripeSubscriptionId: subscriptionId,
                    status: "active",
                    startedAt,
                    initialPeriodEndsAt,
                    isInInitialPeriod: true,
                    currentPeriodEnd: stripeSub.current_period_end * 1000,
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

        // If no session ID, check if user has any Stripe customer with active subscription
        // by looking at the existing subscription record
        if (existing && existing.stripeCustomerId) {
          try {
            // List subscriptions for this customer
            const customerSubs = await stripe.subscriptions.list({
              customer: existing.stripeCustomerId,
              status: "active",
              limit: 1,
            });

            if (customerSubs.data.length > 0) {
              const stripeSub = customerSubs.data[0] as unknown as { id: string; start_date: number; current_period_end: number; status: string };
              const startedAt = stripeSub.start_date * 1000;
              const initialPeriodEndsAt = startedAt + (SUBSCRIPTION_PLAN.initialPeriodMonths * 30 * 24 * 60 * 60 * 1000);

              await updateSubscription(userId, {
                stripeSubscriptionId: stripeSub.id,
                status: "active",
                startedAt,
                initialPeriodEndsAt,
                isInInitialPeriod: true,
                currentPeriodEnd: stripeSub.current_period_end * 1000,
              });
              console.log("[VerifySession] Synced active subscription from Stripe customer for user:", userId);
              return { status: "active", synced: true };
            }
          } catch (err) {
            console.error("[VerifySession] Error checking Stripe customer:", err);
          }
        }

        return { status: existing?.status || "none", synced: false };
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

      // Create or get Stripe customer
      let customerId = existingSubscription?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: ctx.user.email ?? undefined,
          name: ctx.user.name ?? undefined,
          metadata: {
            userId: ctx.user.id.toString(),
          },
        });
        customerId = customer.id;

        // Create subscription record
        await createSubscription({
          userId: ctx.user.id,
          stripeCustomerId: customerId,
          status: "incomplete",
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

  // Voice transcription router
  voice: voiceRouter,

  // Image editing router
  image: imageRouter,
});

export type AppRouter = typeof appRouter;
