import { Request, Response } from "express";
import Stripe from "stripe";
import { getStripe } from "./client";
import { ENV } from "../_core/env";
import { getSubscriptionByStripeSubscriptionId, updateSubscriptionByStripeId, getSubscriptionByStripeCustomerId, updateSubscription } from "../db";
import { SUBSCRIPTION_PLAN } from "./products";

// Extended types for Stripe objects with additional properties
interface StripeSubscriptionExtended {
  id: string;
  start_date: number;
  current_period_end: number;
  status: string;
  canceled_at: number | null;
}

export async function handleStripeWebhook(req: Request, res: Response) {
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"];

  console.log("[Webhook] Received webhook request");

  if (!sig) {
    console.error("[Webhook] No signature found");
    return res.status(400).send("No signature");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      ENV.stripeWebhookSecret
    );
    console.log("[Webhook] Signature verified successfully");
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err);
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  // Handle test events
  if (event.id.startsWith("evt_test_")) {
    console.log("[Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }

  console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[Webhook] Checkout session completed:", session.id);
        console.log("[Webhook] Session mode:", session.mode);
        console.log("[Webhook] Session subscription:", session.subscription);
        console.log("[Webhook] Session customer:", session.customer);

        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId = typeof session.subscription === "string" 
            ? session.subscription 
            : session.subscription.id;

          console.log("[Webhook] Subscription ID:", subscriptionId);

          // Get subscription details from Stripe
          const stripeSubscriptionResponse = await stripe.subscriptions.retrieve(subscriptionId);
          const stripeSubscription = stripeSubscriptionResponse as unknown as StripeSubscriptionExtended;
          const startedAt = stripeSubscription.start_date * 1000;
          const initialPeriodEndsAt = startedAt + (SUBSCRIPTION_PLAN.initialPeriodMonths * 30 * 24 * 60 * 60 * 1000);

          console.log("[Webhook] Stripe subscription status:", stripeSubscription.status);
          console.log("[Webhook] Started at:", new Date(startedAt).toISOString());

          // Update subscription in database
          if (session.customer) {
            const customerId = typeof session.customer === "string" 
              ? session.customer 
              : session.customer.id;

            console.log("[Webhook] Customer ID:", customerId);

            const existingSubscription = await getSubscriptionByStripeCustomerId(customerId);
            console.log("[Webhook] Existing subscription:", existingSubscription);

            if (existingSubscription) {
              console.log("[Webhook] Updating subscription for user:", existingSubscription.userId);
              await updateSubscription(existingSubscription.userId, {
                stripeSubscriptionId: subscriptionId,
                status: "active",
                startedAt,
                initialPeriodEndsAt,
                isInInitialPeriod: true,
                currentPeriodEnd: stripeSubscription.current_period_end * 1000,
              });
              console.log("[Webhook] Subscription updated successfully to active");
            } else {
              console.log("[Webhook] No existing subscription found for customer:", customerId);
            }
          }
        }
        break;
      }

      case "customer.subscription.created": {
        const subscriptionEvent = event.data.object as unknown as StripeSubscriptionExtended;
        console.log("[Webhook] Subscription created:", subscriptionEvent.id);
        console.log("[Webhook] Subscription status:", subscriptionEvent.status);
        
        // Also handle subscription creation to ensure status is updated
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionEvent.id);
        const customer = stripeSubscription.customer;
        const customerId = typeof customer === "string" ? customer : customer?.id;
        
        if (customerId) {
          const existingSubscription = await getSubscriptionByStripeCustomerId(customerId);
          if (existingSubscription && subscriptionEvent.status === "active") {
            const startedAt = subscriptionEvent.start_date * 1000;
            const initialPeriodEndsAt = startedAt + (SUBSCRIPTION_PLAN.initialPeriodMonths * 30 * 24 * 60 * 60 * 1000);
            
            await updateSubscription(existingSubscription.userId, {
              stripeSubscriptionId: subscriptionEvent.id,
              status: "active",
              startedAt,
              initialPeriodEndsAt,
              isInInitialPeriod: true,
              currentPeriodEnd: subscriptionEvent.current_period_end * 1000,
            });
            console.log("[Webhook] Subscription created and updated to active");
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscriptionEvent = event.data.object as unknown as StripeSubscriptionExtended;
        console.log("[Webhook] Subscription updated:", subscriptionEvent.id);
        console.log("[Webhook] New status:", subscriptionEvent.status);

        const existingSubscription = await getSubscriptionByStripeSubscriptionId(subscriptionEvent.id);
        if (existingSubscription) {
          await updateSubscriptionByStripeId(subscriptionEvent.id, {
            status: subscriptionEvent.status as "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "incomplete_expired" | "unpaid",
            currentPeriodEnd: subscriptionEvent.current_period_end * 1000,
            canceledAt: subscriptionEvent.canceled_at ? subscriptionEvent.canceled_at * 1000 : null,
          });
          console.log("[Webhook] Subscription updated in database");
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscriptionEvent = event.data.object as unknown as StripeSubscriptionExtended;
        console.log("[Webhook] Subscription deleted:", subscriptionEvent.id);

        await updateSubscriptionByStripeId(subscriptionEvent.id, {
          status: "canceled",
          canceledAt: Date.now(),
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("[Webhook] Invoice paid:", invoice.id);
        
        // Also update subscription status when invoice is paid
        const invoiceAny = invoice as unknown as { subscription?: string | { id: string } };
        if (invoiceAny.subscription) {
          const subscriptionId = typeof invoiceAny.subscription === "string"
            ? invoiceAny.subscription
            : invoiceAny.subscription.id;
          
          const existingSubscription = await getSubscriptionByStripeSubscriptionId(subscriptionId);
          if (existingSubscription && existingSubscription.status !== "active") {
            await updateSubscriptionByStripeId(subscriptionId, {
              status: "active",
            });
            console.log("[Webhook] Subscription status updated to active after invoice paid");
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("[Webhook] Invoice payment failed:", invoice.id);

        // Get subscription ID from invoice metadata or parent subscription
        const invoiceAny = invoice as unknown as { subscription?: string | { id: string } };
        if (invoiceAny.subscription) {
          const subscriptionId = typeof invoiceAny.subscription === "string"
            ? invoiceAny.subscription
            : invoiceAny.subscription.id;

          await updateSubscriptionByStripeId(subscriptionId, {
            status: "past_due",
          });
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("[Webhook] Error processing event:", error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
