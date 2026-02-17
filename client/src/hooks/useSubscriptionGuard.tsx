import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

/**
 * サブスクリプションがアクティブかどうかをチェックするフック。
 * アクティブでない場合は /home にリダイレクトする。
 * 
 * 各AIアプリのトップレベルコンポーネントで使用する。
 */
export function useSubscriptionGuard() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  const { data: subscription, isLoading: subscriptionLoading } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const isLoading = authLoading || subscriptionLoading;
  const isActive = subscription?.status === "active";

  useEffect(() => {
    if (isLoading || redirecting) return;

    // 未ログイン
    if (!isAuthenticated) {
      setRedirecting(true);
      window.location.href = "/";
      return;
    }

    // サブスクリプションが存在しない
    if (!subscription) {
      setRedirecting(true);
      window.location.href = "/subscription";
      return;
    }

    // サブスクリプションがアクティブでない
    if (!isActive) {
      setRedirecting(true);
      window.location.href = "/home";
      return;
    }
  }, [isLoading, isAuthenticated, subscription, isActive, redirecting]);

  return {
    isLoading: isLoading || redirecting,
    isActive,
    subscription,
  };
}
