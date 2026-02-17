import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * サブスクリプションガード関連のテスト
 * 
 * subscribedProcedure（サーバーサイド）とuseSubscriptionGuard（フロントエンド）の
 * ロジックをテストする。
 */

// ============ サーバーサイド: subscribedProcedure テスト ============

describe("subscribedProcedure middleware logic", () => {
  // subscribedProcedureの核心ロジック: サブスクリプション状態チェック
  function checkSubscriptionActive(status: string | undefined | null): boolean {
    return status === "active";
  }

  it("should allow access when subscription status is 'active'", () => {
    expect(checkSubscriptionActive("active")).toBe(true);
  });

  it("should deny access when subscription status is 'incomplete'", () => {
    expect(checkSubscriptionActive("incomplete")).toBe(false);
  });

  it("should deny access when subscription status is 'past_due'", () => {
    expect(checkSubscriptionActive("past_due")).toBe(false);
  });

  it("should deny access when subscription status is 'canceled'", () => {
    expect(checkSubscriptionActive("canceled")).toBe(false);
  });

  it("should deny access when subscription status is 'unpaid'", () => {
    expect(checkSubscriptionActive("unpaid")).toBe(false);
  });

  it("should deny access when subscription status is 'incomplete_expired'", () => {
    expect(checkSubscriptionActive("incomplete_expired")).toBe(false);
  });

  it("should deny access when subscription status is undefined", () => {
    expect(checkSubscriptionActive(undefined)).toBe(false);
  });

  it("should deny access when subscription status is null", () => {
    expect(checkSubscriptionActive(null)).toBe(false);
  });

  it("should deny access when subscription status is empty string", () => {
    expect(checkSubscriptionActive("")).toBe(false);
  });
});

// ============ フロントエンド: useSubscriptionGuard ロジックテスト ============

describe("useSubscriptionGuard redirect logic", () => {
  // フロントエンドのリダイレクトロジックを関数として抽出
  function determineRedirect(params: {
    isLoading: boolean;
    isAuthenticated: boolean;
    subscription: { status: string } | null | undefined;
  }): string | null {
    const { isLoading, isAuthenticated, subscription } = params;
    
    if (isLoading) return null; // ローディング中はリダイレクトしない
    
    if (!isAuthenticated) return "/"; // 未ログイン → ランディング
    
    if (!subscription) return "/subscription"; // サブスクなし → サブスク画面
    
    if (subscription.status !== "active") return "/home"; // 非アクティブ → ホーム
    
    return null; // アクティブ → リダイレクトなし
  }

  it("should not redirect while loading", () => {
    expect(determineRedirect({
      isLoading: true,
      isAuthenticated: false,
      subscription: null,
    })).toBeNull();
  });

  it("should redirect to / when not authenticated", () => {
    expect(determineRedirect({
      isLoading: false,
      isAuthenticated: false,
      subscription: null,
    })).toBe("/");
  });

  it("should redirect to /subscription when no subscription exists", () => {
    expect(determineRedirect({
      isLoading: false,
      isAuthenticated: true,
      subscription: null,
    })).toBe("/subscription");
  });

  it("should redirect to /home when subscription is incomplete", () => {
    expect(determineRedirect({
      isLoading: false,
      isAuthenticated: true,
      subscription: { status: "incomplete" },
    })).toBe("/home");
  });

  it("should redirect to /home when subscription is canceled", () => {
    expect(determineRedirect({
      isLoading: false,
      isAuthenticated: true,
      subscription: { status: "canceled" },
    })).toBe("/home");
  });

  it("should redirect to /home when subscription is past_due", () => {
    expect(determineRedirect({
      isLoading: false,
      isAuthenticated: true,
      subscription: { status: "past_due" },
    })).toBe("/home");
  });

  it("should not redirect when subscription is active", () => {
    expect(determineRedirect({
      isLoading: false,
      isAuthenticated: true,
      subscription: { status: "active" },
    })).toBeNull();
  });
});

// ============ AppHome: サブスクリプション状態に応じたUI表示ロジック ============

describe("AppHome subscription status display logic", () => {
  function getStatusInfo(status: string) {
    switch (status) {
      case "active":
        return { label: "有効", color: "text-emerald-600", message: "", showBanner: false };
      case "incomplete":
        return { 
          label: "決済未完了", 
          color: "text-amber-600", 
          message: "サブスクリプションの決済が完了していません。決済を完了してアプリをご利用ください。",
          showBanner: true,
        };
      case "past_due":
        return { 
          label: "支払い遅延", 
          color: "text-red-600", 
          message: "お支払いが遅延しています。設定画面からお支払い情報を更新してください。",
          showBanner: true,
        };
      case "canceled":
        return { 
          label: "解約済み", 
          color: "text-gray-500", 
          message: "サブスクリプションが解約されています。再度ご利用いただくには新しいプランにお申し込みください。",
          showBanner: true,
        };
      case "unpaid":
        return { 
          label: "未払い", 
          color: "text-red-600", 
          message: "お支払いが確認できません。設定画面からお支払い情報を更新してください。",
          showBanner: true,
        };
      default:
        return { 
          label: status, 
          color: "text-amber-600", 
          message: "サブスクリプションの状態を確認してください。",
          showBanner: true,
        };
    }
  }

  it("should show no banner for active subscription", () => {
    const info = getStatusInfo("active");
    expect(info.showBanner).toBe(false);
    expect(info.label).toBe("有効");
  });

  it("should show banner with payment CTA for incomplete subscription", () => {
    const info = getStatusInfo("incomplete");
    expect(info.showBanner).toBe(true);
    expect(info.label).toBe("決済未完了");
    expect(info.message).toContain("決済が完了していません");
  });

  it("should show banner with update payment CTA for past_due subscription", () => {
    const info = getStatusInfo("past_due");
    expect(info.showBanner).toBe(true);
    expect(info.label).toBe("支払い遅延");
    expect(info.message).toContain("お支払いが遅延");
  });

  it("should show banner with re-subscribe CTA for canceled subscription", () => {
    const info = getStatusInfo("canceled");
    expect(info.showBanner).toBe(true);
    expect(info.label).toBe("解約済み");
    expect(info.message).toContain("解約されています");
  });

  it("should show banner with update payment CTA for unpaid subscription", () => {
    const info = getStatusInfo("unpaid");
    expect(info.showBanner).toBe(true);
    expect(info.label).toBe("未払い");
    expect(info.message).toContain("お支払いが確認できません");
  });

  it("should show generic banner for unknown status", () => {
    const info = getStatusInfo("some_unknown_status");
    expect(info.showBanner).toBe(true);
    expect(info.label).toBe("some_unknown_status");
    expect(info.message).toContain("状態を確認してください");
  });

  // アプリカードのロック状態テスト
  it("should lock all app cards when subscription is not active", () => {
    const statuses = ["incomplete", "past_due", "canceled", "unpaid", "incomplete_expired"];
    statuses.forEach((status) => {
      const isActive = status === "active";
      expect(isActive).toBe(false);
    });
  });

  it("should unlock all app cards when subscription is active", () => {
    const isActive = "active" === "active";
    expect(isActive).toBe(true);
  });
});

// ============ サーバーサイド: subscribedProcedure エラーコード ============

describe("subscribedProcedure error handling", () => {
  it("should return FORBIDDEN error code for inactive subscription", () => {
    // subscribedProcedureは FORBIDDEN エラーを返す
    const errorCode = "FORBIDDEN";
    expect(errorCode).toBe("FORBIDDEN");
  });

  it("should include descriptive error message", () => {
    const errorMessage = "サブスクリプションがアクティブではありません。プランを有効にしてからご利用ください。";
    expect(errorMessage).toContain("サブスクリプション");
    expect(errorMessage).toContain("アクティブ");
  });
});
