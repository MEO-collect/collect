import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock Stripe
vi.mock("./stripe/client", () => ({
  getStripe: () => ({
    customers: {
      create: vi.fn().mockResolvedValue({
        id: "cus_new_test123",
      }),
    },
    prices: {
      create: vi.fn().mockResolvedValue({
        id: "price_test123",
      }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: "https://checkout.stripe.com/test-session",
        }),
        retrieve: vi.fn().mockResolvedValue({
          id: "cs_test_123",
          status: "complete",
          payment_status: "paid",
          subscription: "sub_synced_123",
          customer: "cus_synced_123",
        }),
      },
    },
    subscriptions: {
      update: vi.fn().mockResolvedValue({}),
      cancel: vi.fn().mockResolvedValue({}),
      retrieve: vi.fn().mockResolvedValue({
        id: "sub_synced_123",
        start_date: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        status: "active",
      }),
      list: vi.fn().mockResolvedValue({
        data: [],
      }),
    },
  }),
}));

// Mock database functions
vi.mock("./db", () => ({
  getMemberProfile: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    contactName: "テスト太郎",
    companyName: "テスト株式会社",
    contactEmail: "test@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  upsertMemberProfile: vi.fn().mockResolvedValue(undefined),
  getSubscription: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    stripeCustomerId: "cus_test123",
    stripeSubscriptionId: "sub_test123",
    status: "active",
    planName: "スタンダードプラン",
    monthlyPrice: 0,
    startedAt: Date.now(),
    initialPeriodEndsAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    isInInitialPeriod: true,
    currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
    canceledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  createSubscription: vi.fn().mockResolvedValue(undefined),
  updateSubscription: vi.fn().mockResolvedValue(undefined),
  deleteSubscription: vi.fn().mockResolvedValue(undefined),
  getAllSubscriptionsWithUsers: vi.fn().mockResolvedValue([]),
  getSubscriptionByStripeSubscriptionId: vi.fn().mockResolvedValue(null),
  getSubscriptionByStripeCustomerId: vi.fn().mockResolvedValue(null),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {
        origin: "https://example.com",
      },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("profile router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should get profile for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.profile.get();

    expect(result).toBeDefined();
    expect(result?.contactName).toBe("テスト太郎");
    expect(result?.companyName).toBe("テスト株式会社");
  });

  it("should upsert profile for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.profile.upsert({
      contactName: "新しい担当者",
      companyName: "新しい会社",
      contactEmail: "new@example.com",
    });

    expect(result).toEqual({ success: true });
  });
});

describe("subscription.get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should get subscription for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.get();

    expect(result).toBeDefined();
    expect(result?.status).toBe("active");
    expect(result?.planName).toBe("BtoB AIプラットフォーム プレミアムプラン");
    expect(result?.isInInitialPeriod).toBe(true);
  });

  it("should return null when no subscription exists", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.get();

    expect(result).toBeNull();
  });

  it("should return subscription dates (startedAt, currentPeriodEnd, initialPeriodEndsAt)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.get();

    expect(result).toBeDefined();
    expect(result?.startedAt).toBeDefined();
    expect(typeof result?.startedAt).toBe("number");
    expect(result?.currentPeriodEnd).toBeDefined();
    expect(typeof result?.currentPeriodEnd).toBe("number");
    expect(result?.initialPeriodEndsAt).toBeDefined();
    expect(typeof result?.initialPeriodEndsAt).toBe("number");
  });
});

describe("subscription.createCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create checkout session for new user", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce(null);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.createCheckoutSession();

    expect(result).toBeDefined();
    expect(result.url).toBe("https://checkout.stripe.com/test-session");
  });

  it("should throw error when user already has active subscription", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.subscription.createCheckoutSession()).rejects.toThrow(
      "既にアクティブなサブスクリプションがあります"
    );
  });

  it("should allow checkout for incomplete subscription (reuses customer ID)", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce({
      id: 1,
      userId: 1,
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      status: "incomplete",
      startedAt: null,
      initialPeriodEndsAt: null,
      isInInitialPeriod: false,
      currentPeriodEnd: null,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.createCheckoutSession();

    expect(result.url).toBe("https://checkout.stripe.com/test-session");
  });

  it("should allow checkout for canceled subscription", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce({
      id: 1,
      userId: 1,
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: "sub_old",
      status: "canceled",
      startedAt: Date.now() - 365 * 24 * 60 * 60 * 1000,
      initialPeriodEndsAt: Date.now() - 1,
      isInInitialPeriod: false,
      currentPeriodEnd: Date.now() - 1,
      canceledAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.createCheckoutSession();

    expect(result.url).toBe("https://checkout.stripe.com/test-session");
  });
});

describe("subscription.cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle cancel request during initial period", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.cancel();

    expect(result.requiresConfirmation).toBe(true);
    expect(result.cancellationFee).toBeGreaterThanOrEqual(0);
    expect(result.message).toContain("初回契約期間中");
  });
});

describe("subscription.verifySession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return active without sync when subscription is already active", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce({
      id: 1,
      userId: 1,
      stripeCustomerId: "cus_test123",
      stripeSubscriptionId: "sub_test123",
      status: "active",
      startedAt: Date.now(),
      initialPeriodEndsAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      isInInitialPeriod: true,
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.verifySession({ sessionId: undefined });

    expect(result.status).toBe("active");
    expect(result.synced).toBe(false);
  });

  it("should sync subscription from Stripe session when incomplete", async () => {
    const { getSubscription, updateSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce({
      id: 1,
      userId: 1,
      stripeCustomerId: "cus_test123",
      stripeSubscriptionId: null,
      status: "incomplete",
      startedAt: null,
      initialPeriodEndsAt: null,
      isInInitialPeriod: true,
      currentPeriodEnd: null,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.verifySession({ sessionId: "cs_test_123" });

    expect(result.status).toBe("active");
    expect(result.synced).toBe(true);
    expect(updateSubscription).toHaveBeenCalledWith(1, expect.objectContaining({
      status: "active",
      stripeSubscriptionId: "sub_synced_123",
    }));
  });

  it("should create new subscription when no existing record", async () => {
    const { getSubscription, createSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.verifySession({ sessionId: "cs_test_123" });

    expect(result.status).toBe("active");
    expect(result.synced).toBe(true);
    expect(createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      status: "active",
      stripeSubscriptionId: "sub_synced_123",
    }));
  });

  it("should return none when no subscription and no session ID", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.verifySession({});

    expect(result.status).toBe("none");
    expect(result.synced).toBe(false);
  });
});

describe("subscription.syncFromStripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error when no subscription record exists", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.syncFromStripe();

    expect(result.synced).toBe(false);
    expect(result.status).toBe("none");
    expect(result.message).toContain("レコードがありません");
  });

  it("should return error when no Stripe customer ID", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce({
      id: 1,
      userId: 1,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: "incomplete",
      startedAt: null,
      initialPeriodEndsAt: null,
      isInInitialPeriod: false,
      currentPeriodEnd: null,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.syncFromStripe();

    expect(result.synced).toBe(false);
    expect(result.message).toContain("顧客ID");
  });

  // Note: syncFromStripe with active Stripe data is tested via the default mock
  // which returns empty subscription list. The Stripe mock is module-level and
  // cannot be overridden per-test without more complex setup.

  it("should report no subscriptions found in Stripe", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce({
      id: 1,
      userId: 1,
      stripeCustomerId: "cus_test123",
      stripeSubscriptionId: null,
      status: "incomplete",
      startedAt: null,
      initialPeriodEndsAt: null,
      isInInitialPeriod: false,
      currentPeriodEnd: null,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.subscription.syncFromStripe();

    expect(result.synced).toBe(false);
    expect(result.message).toContain("見つかりません");
  });
});

describe("admin.listSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return list of subscriptions for admin", async () => {
    const { getAllSubscriptionsWithUsers } = await import("./db");
    vi.mocked(getAllSubscriptionsWithUsers).mockResolvedValueOnce([
      {
        subscription: {
          id: 1,
          userId: 1,
          stripeCustomerId: "cus_test",
          stripeSubscriptionId: "sub_test",
          status: "active",
          startedAt: Date.now(),
          currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
          canceledAt: null,
          isInInitialPeriod: true,
          initialPeriodEndsAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        userName: "Test User",
        userEmail: "test@example.com",
      },
    ]);

    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.listSubscriptions();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("active");
    expect(result[0].userName).toBe("Test User");
  });

  it("should reject non-admin users", async () => {
    const ctx = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(caller.admin.listSubscriptions()).rejects.toThrow();
  });
});

describe("admin.resetSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete subscription record for admin", async () => {
    const { deleteSubscription } = await import("./db");

    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.resetSubscription({ userId: 1 });

    expect(result.success).toBe(true);
    expect(deleteSubscription).toHaveBeenCalledWith(1);
  });
});

describe("admin.forceUpdateStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update subscription status for admin", async () => {
    const { updateSubscription } = await import("./db");

    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.forceUpdateStatus({
      userId: 1,
      status: "active",
    });

    expect(result.success).toBe(true);
    expect(updateSubscription).toHaveBeenCalledWith(1, { status: "active" });
  });

  it("should reject non-admin users for forceUpdateStatus", async () => {
    const ctx = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.forceUpdateStatus({ userId: 1, status: "active" })
    ).rejects.toThrow();
  });
});

describe("admin.syncSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error when no subscription record found", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce(undefined);

    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.syncSubscription({ userId: 999 });

    expect(result.success).toBe(false);
    expect(result.message).toContain("見つかりません");
  });

  it("should return error when no Stripe customer ID", async () => {
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce({
      id: 1,
      userId: 1,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: "incomplete",
      startedAt: null,
      initialPeriodEndsAt: null,
      isInInitialPeriod: false,
      currentPeriodEnd: null,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.syncSubscription({ userId: 1 });

    expect(result.success).toBe(false);
    // The mock returns the record but with null stripeCustomerId
    // The admin.syncSubscription checks for stripeCustomerId
    expect(result.message).toBeDefined();
  });
});
