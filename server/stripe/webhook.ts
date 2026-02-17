import { Request, Response } from "express";
import Stripe from "stripe";
import { getStripe } from "./client";
import { ENV } from "../_core/env";
import { getSubscriptionByStripeSubscriptionId, updateSubscriptionByStripeId, getSubscriptionByStripeCustomerId, updateSubscription, createSubscription, getSubscription } from "../db";
import { SUBSCRIPTION_PLAN } from "./products";

// Extended types for Stripe objects with additional properties
interface StripeSubscriptionExtended {
  id: string;
  start_date: number;
  current_period_end: number;
  status: string;
  canceled_at: number | null;
  customer?: string | { id: string };
}

/**
 * Helper: Calculate initial period end date from start date
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
 * Helper: Activate subscription in database
 */
async function activateSubscription(
  userId: number,
  stripeSubscriptionId: string,
  customerId: string | null,
  stripeSub: StripeSubscriptionExtended,
  existingCustomerId?: string | null,
) {
  const startedAt = stripeSub.start_date * 1000;
  const initialPeriodEndsAt = calcInitialPeriodEnd(startedAt);

  await updateSubscription(userId, {
    stripeCustomerId: customerId || existingCustomerId || undefined,
    stripeSubscriptionId,
    status: "active",
    startedAt,
    initialPeriodEndsAt,
    isInInitialPeriod: true,
    currentPeriodEnd: stripeSub.current_period_end * 1000,
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

        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId = typeof session.subscription === "string" 
            ? session.subscription 
            : session.subscription.id;

          const customerId = extractCustomerId(
            session.customer as string | { id: string } | null
          );

          // Get subscription details from Stripe
          const stripeSubResponse = await stripe.subscriptions.retrieve(subscriptionId);
          const stripeSub = stripeSubResponse as unknown as StripeSubscriptionExtended;

          console.log("[Webhook] Stripe subscription details:", {
            id: stripeSub.id,
            status: stripeSub.status,
            startDate: new Date(stripeSub.start_date * 1000).toISOString(),
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000).toISOString(),
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
              stripeSub,
              existingSub.stripeCustomerId,
            );
          } else {
            // Create new subscription
            const userId = session.client_reference_id 
              ? parseInt(session.client_reference_id, 10) 
              : (session.metadata?.user_id ? parseInt(session.metadata.user_id, 10) : null);

            if (userId && !isNaN(userId)) {
              const startedAt = stripeSub.start_date * 1000;
              const initialPeriodEndsAt = calcInitialPeriodEnd(startedAt);

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
                console.log("[Webhook] New subscription created for user:", userId);
              } catch (createError) {
                // Duplicate key → update instead
                console.warn("[Webhook] Create failed (likely duplicate), updating instead:", createError);
                await updateSubscription(userId, {
                  stripeCustomerId: customerId || undefined,
                  stripeSubscriptionId: subscriptionId,
                  status: "active",
                  startedAt,
                  initialPeriodEndsAt,
                  isInInitialPeriod: true,
                  currentPeriodEnd: stripeSub.current_period_end * 1000,
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
        const subEvent = event.data.object as unknown as StripeSubscriptionExtended;
        const customerId = extractCustomerId(subEvent.customer);

        console.log("[Webhook] customer.subscription.created:", {
          id: subEvent.id,
          status: subEvent.status,
          customerId,
        });

        if (customerId) {
          const existingSub = await getSubscriptionByStripeCustomerId(customerId);
          if (existingSub) {
            // Always update the stripeSubscriptionId regardless of status
            // This ensures the DB record is linked to the Stripe subscription
            const updates: Record<string, unknown> = {
              stripeSubscriptionId: subEvent.id,
            };

            if (subEvent.status === "active" || subEvent.status === "trialing") {
              const startedAt = subEvent.start_date * 1000;
              Object.assign(updates, {
                status: "active",
                startedAt,
                initialPeriodEndsAt: calcInitialPeriodEnd(startedAt),
                isInInitialPeriod: true,
                currentPeriodEnd: subEvent.current_period_end * 1000,
              });
              console.log("[Webhook] Subscription created with active/trialing status, activating");
            } else {
              console.log("[Webhook] Subscription created with status:", subEvent.status, "- linking ID only");
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
        const subEvent = event.data.object as unknown as StripeSubscriptionExtended;
        const customerId = extractCustomerId(subEvent.customer);

        console.log("[Webhook] customer.subscription.updated:", {
          id: subEvent.id,
          status: subEvent.status,
          canceledAt: subEvent.canceled_at,
        });

        // Try to find by subscription ID first, then by customer ID
        let existingSub = await getSubscriptionByStripeSubscriptionId(subEvent.id);
        
        if (!existingSub && customerId) {
          existingSub = await getSubscriptionByStripeCustomerId(customerId);
          if (existingSub) {
            console.log("[Webhook] Found subscription by customerId instead of subscriptionId");
          }
        }

        if (existingSub) {
          const updates: Record<string, unknown> = {
            stripeSubscriptionId: subEvent.id,
            status: subEvent.status as "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "incomplete_expired" | "unpaid",
            currentPeriodEnd: subEvent.current_period_end * 1000,
          };

          if (subEvent.canceled_at) {
            updates.canceledAt = subEvent.canceled_at * 1000;
          }

          // If transitioning to active, also set startedAt if not already set
          if (subEvent.status === "active" && !existingSub.startedAt) {
            const startedAt = subEvent.start_date * 1000;
            updates.startedAt = startedAt;
            updates.initialPeriodEndsAt = calcInitialPeriodEnd(startedAt);
            updates.isInInitialPeriod = true;
          }

          await updateSubscription(existingSub.userId, updates as any);
          console.log("[Webhook] Subscription updated for user:", existingSub.userId, "→", subEvent.status);
        } else {
          console.warn("[Webhook] No subscription found for update:", subEvent.id);
        }
        break;
      }

      // ─── SUBSCRIPTION DELETED ───
      case "customer.subscription.deleted": {
        const subEvent = event.data.object as unknown as StripeSubscriptionExtended;
        console.log("[Webhook] customer.subscription.deleted:", subEvent.id);

        const existingSub = await getSubscriptionByStripeSubscriptionId(subEvent.id);
        if (existingSub) {
          await updateSubscription(existingSub.userId, {
            status: "canceled",
            canceledAt: Date.now(),
          });
          console.log("[Webhook] Subscription canceled for user:", existingSub.userId);
        } else {
          // Try by customer ID
          const customerId = extractCustomerId(subEvent.customer);
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
              const stripeSub = await stripe.subscriptions.retrieve(subscriptionId) as unknown as StripeSubscriptionExtended;
              const startedAt = stripeSub.start_date * 1000;

              await updateSubscription(existingSub.userId, {
                stripeSubscriptionId: subscriptionId,
                status: "active",
                startedAt: existingSub.startedAt || startedAt,
                initialPeriodEndsAt: existingSub.startedAt 
                  ? calcInitialPeriodEnd(existingSub.startedAt) 
                  : calcInitialPeriodEnd(startedAt),
                isInInitialPeriod: true,
                currentPeriodEnd: stripeSub.current_period_end * 1000,
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
