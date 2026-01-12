import Stripe from "stripe";
import { ENV } from "../_core/env";

/**
 * Stripe client singleton
 */
let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const secretKey = ENV.stripeSecretKey;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}
