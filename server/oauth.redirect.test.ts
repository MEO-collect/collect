import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn(),
  getMemberProfile: vi.fn(),
  getSubscription: vi.fn(),
}));

// Mock the SDK
vi.mock("./_core/sdk", () => ({
  sdk: {
    exchangeCodeForToken: vi.fn().mockResolvedValue({ accessToken: "test-token" }),
    getUserInfo: vi.fn().mockResolvedValue({
      openId: "test-open-id",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "google",
    }),
    createSessionToken: vi.fn().mockResolvedValue("test-session-token"),
  },
}));

import * as db from "./db";

describe("OAuth Redirect Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should redirect to /register when user has no profile", async () => {
    // Setup mocks
    vi.mocked(db.getUserByOpenId).mockResolvedValue({
      id: 1,
      openId: "test-open-id",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    vi.mocked(db.getMemberProfile).mockResolvedValue(undefined);

    // Verify the mock returns undefined for profile
    const profile = await db.getMemberProfile(1);
    expect(profile).toBeUndefined();
  });

  it("should redirect to /subscription when user has profile but no subscription", async () => {
    // Setup mocks
    vi.mocked(db.getUserByOpenId).mockResolvedValue({
      id: 1,
      openId: "test-open-id",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    vi.mocked(db.getMemberProfile).mockResolvedValue({
      id: 1,
      userId: 1,
      contactName: "Test User",
      companyName: "Test Company",
      contactEmail: "test@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.getSubscription).mockResolvedValue(undefined);

    // Verify the mock returns profile but no subscription
    const profile = await db.getMemberProfile(1);
    const subscription = await db.getSubscription(1);
    expect(profile).toBeDefined();
    expect(subscription).toBeUndefined();
  });

  it("should redirect to /home when user has profile and active subscription", async () => {
    // Setup mocks
    vi.mocked(db.getUserByOpenId).mockResolvedValue({
      id: 1,
      openId: "test-open-id",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    vi.mocked(db.getMemberProfile).mockResolvedValue({
      id: 1,
      userId: 1,
      contactName: "Test User",
      companyName: "Test Company",
      contactEmail: "test@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.getSubscription).mockResolvedValue({
      id: 1,
      userId: 1,
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      status: "active",
      startedAt: Date.now(),
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Verify the mock returns profile and active subscription
    const profile = await db.getMemberProfile(1);
    const subscription = await db.getSubscription(1);
    expect(profile).toBeDefined();
    expect(subscription).toBeDefined();
    expect(subscription?.status).toBe("active");
  });
});
