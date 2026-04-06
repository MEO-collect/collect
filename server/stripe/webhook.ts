import { Request, Response } from "express";
import Stripe from "stripe";
import { getStripe } from "./client";
import { ENV } from "../_core/env";
import { getSubscriptionByStripeSubscriptionId, updateSubscriptionByStripeId, getSubscriptionByStripeCustomerId, updateSubscription, createSubscription, getSubscription } from "../db";
import { SUBSCRIPTION_PLAN } from "./products";
import { extractSubData, subDataToDbFields } from "./helpers";
import { addPurchasedTokens, grantMonthlyTokens } from "../tokenManager";

/**
 * Helper: Calculate initial period end date from start date (ms)
 */
function calcInitialPeriodEnd(startedAt: number): number {
  return startedAt + (SUBSCRIPTION_PLAN.initialPeriodMonths * 30 * 24 * 60 * 60 * 1000);
}

/**
 * Helper: Extract customer ID from various Stripe object formats
 */
function extractCustomerId(customer: string | { id: string } | null | undefined): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Helper: Find existing subscription by multiple strategies
 */
async function findExistingSubscription(
  customerId: string | null,
  clientReferenceId: string | null | undefined,
  metadata: Record<string, string> | null | undefined,
  stripeSubscriptionId?: string,
) {
  // Strategy 1: By Stripe subscription ID
  if (stripeSubscriptionId) {
    const sub = await getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
    if (sub) {
      console.log("[Webhook] Found subscription by stripeSubscriptionId:", stripeSubscriptionId);
      return sub;
    }
  }

  // Strategy 2: By Stripe customer ID
  if (customerId) {
    const sub = await getSubscriptionByStripeCustomerId(customerId);
    if (sub) {
      console.log("[Webhook] Found subscription by customerId:", customerId);
      return sub;
    }
  }

  // Strategy 3: By client_reference_id (userId)
  if (clientReferenceId) {
    const userId = parseInt(clientReferenceId, 10);
    if (!isNaN(userId)) {
      const sub = await getSubscription(userId);
      if (sub) {
        console.log("[Webhook] Found subscription by client_reference_id userId:", userId);
        return sub;
      }
    }
  }

  // Strategy 4: By metadata user_id
  if (metadata?.user_id) {
    const userId = parseInt(metadata.user_id, 10);
    if (!isNaN(userId)) {
      const sub = await getSubscription(userId);
      if (sub) {
        console.log("[Webhook] Found subscription by metadata userId:", userId);
        return sub;
      }
    }
  }

  return null;
}

/**
 * Helper: Activate subscription in database using safe extraction
 */
async function activateSubscription(
  userId: number,
  stripeSubscriptionId: string,
  customerId: string | null,
  stripeSubRaw: any,
  existingCustomerId?: string | null,
) {
  const subData = extractSubData(stripeSubRaw);
  const dbFields = subDataToDbFields(subData);

  await updateSubscription(userId, {
    stripeCustomerId: customerId || existingCustomerId || undefined,
    ...dbFields,
    status: "active",
  });

  console.log(`[Webhook] Subscription activated for user ${userId} (sub: ${stripeSubscriptionId})`);
}

export async function handleStripeWebhook(req: Request, res: Response) {
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"];

  console.log("[Webhook] ─── Incoming webhook request ───");

  if (!sig) {
    console.error("[Webhook] No stripe-signature header found");
    return res.status(400).send("No signature");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      ENV.stripeWebhookSecret
    );
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err);
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  // Handle test events
  if (event.id.startsWith("evt_test_")) {
    console.log("[Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }

  const eventTimestamp = new Date(event.created * 1000).toISOString();
  console.log(`[Webhook] Event: ${event.type} | ID: ${event.id} | Created: ${eventTimestamp}`);

  try {
    switch (event.type) {
      // ─── CHECKOUT SESSION COMPLETED ───
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[Webhook] checkout.session.completed:", {
          sessionId: session.id,
          mode: session.mode,
          subscription: session.subscription,
          customer: session.customer,
          clientReferenceId: session.client_reference_id,
          metadata: session.metadata,
          paymentStatus: session.payment_status,
        });

        // トークン追加購入の処理
        if (session.mode === "payment" && session.metadata?.purchase_type === "token_addon") {
          const userId = session.client_reference_id
            ? parseInt(session.client_reference_id, 10)
            : session.metadata?.user_id ? parseInt(session.metadata.user_id, 10) : null;
          const tokens = session.metadata?.tokens ? parseInt(session.metadata.tokens, 10) : 0;
          const planId = session.metadata?.plan_id || "unknown";
          const paymentIntentId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id || "";

          if (userId && !isNaN(userId) && tokens > 0) {
            await addPurchasedTokens(userId, tokens, paymentIntentId, planId);
            console.log(`[Webhook] Token purchase: user=${userId} tokens=${tokens} plan=${planId}`);
          } else {
            console.error("[Webhook] Token purchase: invalid userId or tokens", { userId, tokens });
          }
          break;
        }

        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId = typeof session.subscription === "string" 
            ? session.subscription 
            : session.subscription.id;

          const customerId = extractCustomerId(
            session.customer as string | { id: string } | null
          );

          // Get subscription details from Stripe
          const stripeSubResponse = await stripe.subscriptions.retrieve(subscriptionId);
          const subData = extractSubData(stripeSubResponse);

          console.log("[Webhook] Stripe subscription details:", {
            id: subData.id,
            status: subData.status,
            startDate: new Date(subData.startDate * 1000).toISOString(),
            currentPeriodEnd: new Date(subData.currentPeriodEnd * 1000).toISOString(),
          });

          // Find existing subscription
          const existingSub = await findExistingSubscription(
            customerId,
            session.client_reference_id,
            session.metadata as Record<string, string> | null,
            subscriptionId,
          );

          if (existingSub) {
            await activateSubscription(
              existingSub.userId,
              subscriptionId,
              customerId,
              stripeSubResponse,
              existingSub.stripeCustomerId,
            );
          } else {
            // Create new subscription
            const userId = session.client_reference_id 
              ? parseInt(session.client_reference_id, 10) 
              : (session.metadata?.user_id ? parseInt(session.metadata.user_id, 10) : null);

            if (userId && !isNaN(userId)) {
              const dbFields = subDataToDbFields(subData);

              try {
                await createSubscription({
                  userId,
                  stripeCustomerId: customerId || undefined,
                  ...dbFields,
                  status: "active",
                });
                console.log("[Webhook] New subscription created for user:", userId);
              } catch (createError) {
                // Duplicate key → update instead
                console.warn("[Webhook] Create failed (likely duplicate), updating instead:", createError);
                await updateSubscription(userId, {
                  stripeCustomerId: customerId || undefined,
                  ...dbFields,
                  status: "active",
                });
              }
            } else {
              console.error("[Webhook] CRITICAL: No user ID found in session - cannot create subscription");
              console.error("[Webhook] Session details:", JSON.stringify({
                id: session.id,
                client_reference_id: session.client_reference_id,
                metadata: session.metadata,
                customer: session.customer,
              }));
            }
          }
        }
        break;
      }

      // ─── SUBSCRIPTION CREATED ───
      case "customer.subscription.created": {
        const subEventRaw = event.data.object;
        const subData = extractSubData(subEventRaw);
        const customerId = extractCustomerId((subEventRaw as any).customer);

        console.log("[Webhook] customer.subscription.created:", {
          id: subData.id,
          status: subData.status,
          customerId,
        });

        if (customerId) {
          const existingSub = await getSubscriptionByStripeCustomerId(customerId);
          if (existingSub) {
            // Always update the stripeSubscriptionId regardless of status
            const updates: Record<string, unknown> = {
              stripeSubscriptionId: subData.id,
            };

            if (subData.status === "active" || subData.status === "trialing") {
              const dbFields = subDataToDbFields(subData);
              Object.assign(updates, dbFields, { status: "active" });
              console.log("[Webhook] Subscription created with active/trialing status, activating");
            } else {
              console.log("[Webhook] Subscription created with status:", subData.status, "- linking ID only");
            }

            await updateSubscription(existingSub.userId, updates as any);
          } else {
            console.log("[Webhook] No existing subscription found for customer:", customerId);
          }
        }
        break;
      }

      // ─── SUBSCRIPTION UPDATED ───
      case "customer.subscription.updated": {
        const subEventRaw = event.data.object;
        const subData = extractSubData(subEventRaw);
        const customerId = extractCustomerId((subEventRaw as any).customer);

        console.log("[Webhook] customer.subscription.updated:", {
          id: subData.id,
          status: subData.status,
          canceledAt: subData.canceledAt,
        });

        // Try to find by subscription ID first, then by customer ID
        let existingSub = await getSubscriptionByStripeSubscriptionId(subData.id);
        
        if (!existingSub && customerId) {
          existingSub = await getSubscriptionByStripeCustomerId(customerId);
          if (existingSub) {
            console.log("[Webhook] Found subscription by customerId instead of subscriptionId");
          }
        }

        if (existingSub) {
          const updates: Record<string, unknown> = {
            stripeSubscriptionId: subData.id,
            status: subData.status as "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "incomplete_expired" | "unpaid",
            currentPeriodEnd: subData.currentPeriodEnd * 1000,
          };

          if (subData.canceledAt) {
            updates.canceledAt = subData.canceledAt * 1000;
          }

          // If transitioning to active, also set startedAt if not already set
          if (subData.status === "active" && !existingSub.startedAt) {
            const startedAt = subData.startDate * 1000;
            updates.startedAt = startedAt;
            updates.initialPeriodEndsAt = calcInitialPeriodEnd(startedAt);
            updates.isInInitialPeriod = true;
          }

          await updateSubscription(existingSub.userId, updates as any);
          console.log("[Webhook] Subscription updated for user:", existingSub.userId, "→", subData.status);
        } else {
          console.warn("[Webhook] No subscription found for update:", subData.id);
        }
        break;
      }

      // ─── SUBSCRIPTION DELETED ───
      case "customer.subscription.deleted": {
        const subEventRaw = event.data.object;
        const subData = extractSubData(subEventRaw);
        console.log("[Webhook] customer.subscription.deleted:", subData.id);

        const existingSub = await getSubscriptionByStripeSubscriptionId(subData.id);
        if (existingSub) {
          await updateSubscription(existingSub.userId, {
            status: "canceled",
            canceledAt: Date.now(),
          });
          console.log("[Webhook] Subscription canceled for user:", existingSub.userId);
        } else {
          // Try by customer ID
          const customerId = extractCustomerId((subEventRaw as any).customer);
          if (customerId) {
            const sub = await getSubscriptionByStripeCustomerId(customerId);
            if (sub) {
              await updateSubscription(sub.userId, {
                status: "canceled",
                canceledAt: Date.now(),
              });
              console.log("[Webhook] Subscription canceled (found by customerId) for user:", sub.userId);
            }
          }
        }
        break;
      }

      // ─── INVOICE PAID ───
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceAny = invoice as unknown as { subscription?: string | { id: string } };
        
        console.log("[Webhook] invoice.paid:", {
          id: invoice.id,
          subscription: invoiceAny.subscription,
        });

        if (invoiceAny.subscription) {
          const subscriptionId = typeof invoiceAny.subscription === "string"
            ? invoiceAny.subscription
            : invoiceAny.subscription.id;
          
          // Find by subscription ID or customer ID
          let existingSub = await getSubscriptionByStripeSubscriptionId(subscriptionId);
          
          if (!existingSub) {
            const customerId = extractCustomerId(
              (invoice as unknown as { customer?: string | { id: string } }).customer
            );
            if (customerId) {
              existingSub = await getSubscriptionByStripeCustomerId(customerId);
            }
          }

          if (existingSub && existingSub.status !== "active") {
            // Get fresh subscription data from Stripe
            try {
              const stripeSubResponse = await stripe.subscriptions.retrieve(subscriptionId);
              const subData = extractSubData(stripeSubResponse);
              const dbFields = subDataToDbFields(subData);

              await updateSubscription(existingSub.userId, {
                ...dbFields,
                status: "active",
                startedAt: existingSub.startedAt || dbFields.startedAt,
                initialPeriodEndsAt: existingSub.startedAt 
                  ? calcInitialPeriodEnd(existingSub.startedAt) 
                  : dbFields.initialPeriodEndsAt,
              });
              console.log("[Webhook] Subscription activated after invoice.paid for user:", existingSub.userId);
            } catch (err) {
              console.error("[Webhook] Error retrieving subscription after invoice.paid:", err);
              // Fallback: just update status
              await updateSubscriptionByStripeId(subscriptionId, {
                status: "active",
              });
            }
          }
        }
        break;
      }

      // ─── INVOICE PAYMENT FAILED ───
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceAny = invoice as unknown as { subscription?: string | { id: string } };
        
        console.log("[Webhook] invoice.payment_failed:", {
          id: invoice.id,
          subscription: invoiceAny.subscription,
        });

        if (invoiceAny.subscription) {
          const subscriptionId = typeof invoiceAny.subscription === "string"
            ? invoiceAny.subscription
            : invoiceAny.subscription.id;

          const existingSub = await getSubscriptionByStripeSubscriptionId(subscriptionId);
          if (existingSub) {
            await updateSubscription(existingSub.userId, {
              status: "past_due",
            });
            console.log("[Webhook] Subscription set to past_due for user:", existingSub.userId);
          }
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    console.log(`[Webhook] ─── Event ${event.id} processed successfully ───`);
    res.json({ received: true });
  } catch (error) {
    console.error("[Webhook] CRITICAL ERROR processing event:", event.type, event.id);
    console.error("[Webhook] Error details:", error);
    // Still return 200 to prevent Stripe from retrying indefinitely
    // The error is logged for manual investigation
    res.status(200).json({ received: true, error: "Internal processing error" });
  }
}
