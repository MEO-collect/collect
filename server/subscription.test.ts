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
      },
    },
    subscriptions: {
      update: vi.fn().mockResolvedValue({}),
      cancel: vi.fn().mockResolvedValue({}),
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
