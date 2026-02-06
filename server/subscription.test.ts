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
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
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

describe("subscription router", () => {
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

  it("should return subscription dates (startedAt, currentPeriodEnd, initialPeriodEndsAt)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.get();

    expect(result).toBeDefined();
    // 契約開始日が存在することを確認
    expect(result?.startedAt).toBeDefined();
    expect(typeof result?.startedAt).toBe("number");
    // 次回更新日が存在することを確認
    expect(result?.currentPeriodEnd).toBeDefined();
    expect(typeof result?.currentPeriodEnd).toBe("number");
    // 初回契約期間終了日が存在することを確認
    expect(result?.initialPeriodEndsAt).toBeDefined();
    expect(typeof result?.initialPeriodEndsAt).toBe("number");
  });

  it("should create checkout session for new user", async () => {
    // Mock getSubscription to return null for this test
    const { getSubscription } = await import("./db");
    vi.mocked(getSubscription).mockResolvedValueOnce(null);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.createCheckoutSession();

    expect(result).toBeDefined();
    expect(result.url).toBe("https://checkout.stripe.com/test-session");
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
