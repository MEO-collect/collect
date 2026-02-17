import { describe, expect, it } from "vitest";
import { extractSubData, subDataToDbFields } from "./stripe/helpers";

describe("extractSubData", () => {
  it("should extract data from old Stripe API format (top-level current_period_end)", () => {
    const sub = {
      id: "sub_old_format",
      status: "active",
      start_date: 1770283524,
      current_period_end: 1772702724,
      canceled_at: null,
    };

    const result = extractSubData(sub);

    expect(result.id).toBe("sub_old_format");
    expect(result.status).toBe("active");
    expect(result.startDate).toBe(1770283524);
    expect(result.currentPeriodEnd).toBe(1772702724);
    expect(result.canceledAt).toBeNull();
  });

  it("should extract data from new Stripe API format (current_period_end in items.data[0])", () => {
    const sub = {
      id: "sub_new_format",
      status: "active",
      start_date: 1770283524,
      // current_period_end is NOT at top level
      items: {
        data: [
          {
            current_period_end: 1772702724,
            current_period_start: 1770283524,
          },
        ],
      },
      canceled_at: null,
    };

    const result = extractSubData(sub);

    expect(result.id).toBe("sub_new_format");
    expect(result.status).toBe("active");
    expect(result.startDate).toBe(1770283524);
    expect(result.currentPeriodEnd).toBe(1772702724);
    expect(result.canceledAt).toBeNull();
  });

  it("should handle undefined current_period_end with fallback", () => {
    const sub = {
      id: "sub_no_period",
      status: "active",
      start_date: 1770283524,
      // No current_period_end anywhere
      canceled_at: null,
    };

    const result = extractSubData(sub);

    expect(result.id).toBe("sub_no_period");
    expect(result.startDate).toBe(1770283524);
    // Fallback: start_date + 30 days in seconds
    expect(result.currentPeriodEnd).toBe(1770283524 + 30 * 24 * 60 * 60);
    expect(Number.isFinite(result.currentPeriodEnd)).toBe(true);
  });

  it("should use created as fallback when start_date is missing", () => {
    const sub = {
      id: "sub_no_start",
      status: "active",
      created: 1770283524,
      current_period_end: 1772702724,
      canceled_at: null,
    };

    const result = extractSubData(sub);

    expect(result.startDate).toBe(1770283524);
    expect(result.currentPeriodEnd).toBe(1772702724);
  });

  it("should handle canceled subscription with canceled_at", () => {
    const sub = {
      id: "sub_canceled",
      status: "canceled",
      start_date: 1770283524,
      current_period_end: 1772702724,
      canceled_at: 1771000000,
    };

    const result = extractSubData(sub);

    expect(result.canceledAt).toBe(1771000000);
  });

  it("should never return NaN for any numeric field", () => {
    const sub = {
      id: "sub_bad_data",
      status: "active",
      start_date: undefined,
      current_period_end: undefined,
      canceled_at: undefined,
    };

    const result = extractSubData(sub);

    expect(Number.isFinite(result.startDate)).toBe(true);
    expect(Number.isFinite(result.currentPeriodEnd)).toBe(true);
    expect(result.canceledAt === null || Number.isFinite(result.canceledAt)).toBe(true);
  });

  it("should never return NaN even with NaN inputs", () => {
    const sub = {
      id: "sub_nan",
      status: "active",
      start_date: NaN,
      current_period_end: NaN,
      canceled_at: NaN,
    };

    const result = extractSubData(sub);

    expect(Number.isFinite(result.startDate)).toBe(true);
    expect(Number.isFinite(result.currentPeriodEnd)).toBe(true);
    expect(result.canceledAt).toBeNull(); // NaN should become null
  });
});

describe("subDataToDbFields", () => {
  it("should convert seconds to milliseconds for DB storage", () => {
    const subData = {
      id: "sub_test",
      status: "active",
      startDate: 1770283524,
      currentPeriodEnd: 1772702724,
      canceledAt: null,
    };

    const dbFields = subDataToDbFields(subData);

    expect(dbFields.stripeSubscriptionId).toBe("sub_test");
    expect(dbFields.status).toBe("active");
    expect(dbFields.startedAt).toBe(1770283524 * 1000);
    expect(dbFields.currentPeriodEnd).toBe(1772702724 * 1000);
    expect(dbFields.isInInitialPeriod).toBe(true);
    expect(Number.isFinite(dbFields.initialPeriodEndsAt)).toBe(true);
  });

  it("should calculate initialPeriodEndsAt as startedAt + 12 months", () => {
    const subData = {
      id: "sub_test",
      status: "active",
      startDate: 1770283524,
      currentPeriodEnd: 1772702724,
      canceledAt: null,
    };

    const dbFields = subDataToDbFields(subData);

    const expectedInitialPeriodEnd = 1770283524 * 1000 + (12 * 30 * 24 * 60 * 60 * 1000);
    expect(dbFields.initialPeriodEndsAt).toBe(expectedInitialPeriodEnd);
  });

  it("should never produce NaN in any DB field", () => {
    const subData = {
      id: "sub_test",
      status: "active",
      startDate: Math.floor(Date.now() / 1000),
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 2592000,
      canceledAt: null,
    };

    const dbFields = subDataToDbFields(subData);

    expect(Number.isFinite(dbFields.startedAt)).toBe(true);
    expect(Number.isFinite(dbFields.currentPeriodEnd)).toBe(true);
    expect(Number.isFinite(dbFields.initialPeriodEndsAt)).toBe(true);
  });
});
