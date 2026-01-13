import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock Stripe
vi.mock("./stripe/client", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({
          id: "cs_test_123",
          status: "complete",
          payment_status: "paid",
          subscription: "sub_test_123",
        }),
      },
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: "sub_test_123",
        status: "active",
        start_date: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      }),
    },
  }),
}));

// Mock db functions
vi.mock("./db", () => ({
  getSubscription: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    stripeCustomerId: "cus_test_123",
    status: "incomplete",
  }),
  updateSubscription: vi.fn().mockResolvedValue(undefined),
  getMemberProfile: vi.fn().mockResolvedValue(null),
  upsertMemberProfile: vi.fn().mockResolvedValue(undefined),
  createSubscription: vi.fn().mockResolvedValue(undefined),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: { origin: "https://example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("subscription.activateFromSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should activate subscription from a valid session ID", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.activateFromSession({
      sessionId: "cs_test_123",
    });

    expect(result).toEqual({
      success: true,
      status: "active",
    });
  });

  it("should return subscription status as active after activation", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First activate
    await caller.subscription.activateFromSession({
      sessionId: "cs_test_123",
    });

    // Verify updateSubscription was called with active status
    const { updateSubscription } = await import("./db");
    expect(updateSubscription).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: "active",
        stripeSubscriptionId: "sub_test_123",
      })
    );
  });
});
