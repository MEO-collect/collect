/**
 * Stripe Subscription Data Extraction Helpers
 * 
 * In newer Stripe API versions, some fields like `current_period_end` have moved
 * from the subscription top-level to `items.data[0]`. This module provides safe
 * extraction functions that handle both old and new API response formats.
 */

import { SUBSCRIPTION_PLAN } from "./products";

/**
 * Extracted subscription data with all fields guaranteed to be valid numbers or null
 */
export interface ExtractedSubData {
  id: string;
  status: string;
  startDate: number;       // Unix timestamp in seconds
  currentPeriodEnd: number; // Unix timestamp in seconds
  canceledAt: number | null;
}

/**
 * Safely extract subscription data from a Stripe subscription object.
 * Handles both old format (top-level fields) and new format (fields in items.data[0]).
 */
export function extractSubData(sub: any): ExtractedSubData {
  const id = sub.id as string;
  const status = sub.status as string;

  // start_date: available at top level in all versions
  const startDate = safeTimestamp(sub.start_date) ?? safeTimestamp(sub.created) ?? Math.floor(Date.now() / 1000);

  // current_period_end: may be at top level OR in items.data[0]
  let currentPeriodEnd = safeTimestamp(sub.current_period_end);
  if (currentPeriodEnd === null) {
    // Try items.data[0].current_period_end (newer Stripe API versions)
    const firstItem = sub.items?.data?.[0];
    if (firstItem) {
      currentPeriodEnd = safeTimestamp(firstItem.current_period_end);
    }
  }
  if (currentPeriodEnd === null) {
    // Fallback: start_date + 1 month
    currentPeriodEnd = startDate + (30 * 24 * 60 * 60);
  }

  // canceled_at
  const canceledAt = safeTimestamp(sub.canceled_at);

  return { id, status, startDate, currentPeriodEnd, canceledAt };
}

/**
 * Convert extracted sub data to DB update fields (timestamps in milliseconds)
 */
export function subDataToDbFields(data: ExtractedSubData) {
  const startedAt = data.startDate * 1000;
  const initialPeriodEndsAt = startedAt + (SUBSCRIPTION_PLAN.initialPeriodMonths * 30 * 24 * 60 * 60 * 1000);
  const currentPeriodEnd = data.currentPeriodEnd * 1000;

  return {
    stripeSubscriptionId: data.id,
    status: data.status as "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "incomplete_expired" | "unpaid",
    startedAt,
    initialPeriodEndsAt,
    isInInitialPeriod: true,
    currentPeriodEnd,
  };
}

/**
 * Safely convert a value to a Unix timestamp (number).
 * Returns null if the value is not a valid finite number.
 */
function safeTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return null;
}
