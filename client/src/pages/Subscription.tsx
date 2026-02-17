import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Check, CreditCard, Loader2, RefreshCw, Shield, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const features = [
  "音声録音・書き起こし・要約アプリ",
  "AI文章作成（SNS・ブログ・MEO対応）",
  "AI画像加工（フォトエディター＆マジック消しゴム）",
  "カレンダーQRコード生成",
  "商材ドクター（AI商材診断）",
];

/**
 * サブスクリプション登録ページ
 * 
 * リダイレクトルール：
 * - 未ログイン → / (ランディング)
 * - ログイン済み＋アクティブなサブスクリプション＋プロファイルあり → /home
 * - それ以外 → このページを表示
 * 
 * incomplete/canceled/incomplete_expired状態のサブスクリプションは
 * 「未完了」として扱い、再度Stripe Checkoutに進めるようにする。
 */
export default function Subscription() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const verifySession = trpc.subscription.verifySession.useMutation();
  const syncFromStripe = trpc.subscription.syncFromStripe.useMutation();

  const createCheckout = trpc.subscription.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("決済ページに移動します");
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      console.error("Checkout error:", error);
      if (error.message?.includes("既にアクティブ")) {
        toast.info("サブスクリプションは既にアクティブです。ページを更新します。");
        refetchSubscription();
      } else {
        toast.error(error.message || "エラーが発生しました");
      }
    },
  });

  // サブスクリプションがアクティブかどうか
  const isActive = subscription?.status === "active";
  
  // incomplete/canceled/incomplete_expired は「未完了」として再Checkout可能
  const canStartCheckout = !subscription || 
    subscription.status === "incomplete" || 
    subscription.status === "canceled" || 
    subscription.status === "incomplete_expired";

  const handleSubscribe = () => {
    createCheckout.mutate();
  };

  // 「AIツール使用画面へ移動」ボタンのハンドラ
  const handleGoToApp = async () => {
    setIsSyncing(true);
    try {
      // まずStripeから同期を試みる
      const syncResult = await syncFromStripe.mutateAsync();
      console.log("SyncFromStripe result:", syncResult);
      
      if (!syncResult.synced) {
        // syncFromStripeで同期できなかった場合、verifySessionも試す
        const verifyResult = await verifySession.mutateAsync({});
        console.log("VerifySession result:", verifyResult);
      }
      
      // サブスクリプション情報を再取得
      await refetchSubscription();
      
      // 遷移先を決定
      if (!profile) {
        window.location.href = "/register";
      } else {
        window.location.href = "/home";
      }
    } catch (err) {
      console.error("Failed to sync:", err);
      // エラーでも遷移を試みる
      if (!profile) {
        window.location.href = "/register";
      } else {
        window.location.href = "/home";
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // 手動同期ボタン
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncFromStripe.mutateAsync();
      await refetchSubscription();
      if (result.synced) {
        toast.success(result.message || "同期しました");
      } else {
        toast.info(result.message || "同期する情報がありません");
      }
    } catch (err) {
      console.error("Manual sync error:", err);
      toast.error("同期に失敗しました");
    } finally {
      setIsSyncing(false);
    }
  };

  // 未ログインの場合はランディングページへ
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/";
    }
  }, [authLoading, isAuthenticated]);

  // アクティブなサブスクリプション＋プロファイルがある場合のみホームへリダイレクト
  useEffect(() => {
    if (authLoading || subscriptionLoading || profileLoading) return;
    if (!isAuthenticated) return;
    
    if (isActive && profile) {
      window.location.href = "/home";
    }
  }, [authLoading, subscriptionLoading, profileLoading, isActive, profile, isAuthenticated]);

  // タブ復帰時にサブスクリプション状態を再取得
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        refetchSubscription();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, refetchSubscription]);

  if (authLoading || subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center gradient-mesh p-4 relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div className="floating-orb w-80 h-80 bg-primary/20 top-[-10%] right-[-10%]" style={{ animationDelay: '0s' }} />
      <div className="floating-orb w-64 h-64 bg-blue-400/20 bottom-[-5%] left-[-10%]" style={{ animationDelay: '2s' }} />
      <div className="floating-orb w-48 h-48 bg-purple-400/15 top-[30%] left-[5%]" style={{ animationDelay: '4s' }} />

      <div className="glass-card w-full max-w-lg p-8 relative z-10">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">プレミアムプランに登録</h1>
          <p className="text-muted-foreground">
            5つのAIアプリを無制限にご利用いただけます
          </p>
        </div>

        <div className="space-y-6">
          {/* 価格表示 */}
          <div className="text-center p-6 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/30">
            <div className="text-5xl font-bold text-gradient">
              ¥0
            </div>
            <span className="text-lg text-muted-foreground">/月</span>
            <p className="text-sm text-muted-foreground mt-3">
              テスト期間中は無料でご利用いただけます
            </p>
          </div>

          {/* 機能一覧 */}
          <div className="space-y-3">
            {features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                  <Check className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-sm font-medium">{feature}</span>
              </div>
            ))}
          </div>

          {/* 契約条件 */}
          <div className="p-5 rounded-2xl bg-amber-50/80 backdrop-blur-sm border border-amber-200/50">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 flex-shrink-0">
                <Shield className="h-5 w-5 text-amber-600" />
              </div>
              <div className="text-sm">
                <p className="font-semibold text-amber-800 mb-2">ご契約条件</p>
                <ul className="list-disc list-inside space-y-1 text-amber-700">
                  <li>初回1年間は基本的に解約できません</li>
                  <li>初回期間中の解約は解約金が発生します</li>
                  <li>初回期間後はいつでも解約可能です</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 登録ボタン */}
          {isActive ? (
            // アクティブなサブスクリプションがある場合
            <div className="p-5 rounded-2xl bg-green-50/80 backdrop-blur-sm border border-green-200/50 text-center">
              <div className="flex items-center justify-center gap-2 text-green-700 mb-2">
                <Check className="h-5 w-5" />
                <span className="font-semibold">登録済み</span>
              </div>
              <p className="text-sm text-green-600">
                サブスクリプションはアクティブです
              </p>
            </div>
          ) : canStartCheckout ? (
            // 未登録 or incomplete/canceled → Checkout可能
            <div className="space-y-3">
              {subscription?.status === "incomplete" && (
                <div className="p-4 rounded-xl bg-amber-50/80 backdrop-blur-sm border border-amber-200/50 text-center">
                  <p className="text-sm text-amber-700">
                    前回の決済が完了していません。下のボタンから再度お手続きください。
                  </p>
                </div>
              )}
              <Button 
                className="w-full btn-gradient text-white border-0 h-14 text-lg rounded-xl"
                size="lg"
                type="button"
                onClick={handleSubscribe}
                disabled={createCheckout.isPending}
              >
                {createCheckout.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-5 w-5" />
                    {subscription?.status === "incomplete" 
                      ? "決済を完了する" 
                      : subscription?.status === "canceled"
                        ? "新しいプランに申し込む"
                        : "サブスクリプションを開始"}
                  </>
                )}
              </Button>
            </div>
          ) : (
            // その他の状態（past_due, unpaidなど）
            <div className="p-5 rounded-2xl bg-amber-50/80 backdrop-blur-sm border border-amber-200/50 text-center">
              <p className="text-sm text-amber-700 mb-3">
                サブスクリプションに問題があります（ステータス: {subscription?.status}）。
                設定画面からお支払い情報を更新してください。
              </p>
              <Button
                variant="outline"
                className="glass-button rounded-xl"
                type="button"
                onClick={() => { window.location.href = "/settings"; }}
              >
                設定画面へ
              </Button>
            </div>
          )}

          <p className="text-xs text-center text-muted-foreground">
            決済はStripeの安全な決済システムを使用しています
          </p>

          {/* 登録済みユーザー向けリンク */}
          <div className="pt-4 border-t border-white/30 space-y-3">
            <p className="text-sm text-center text-muted-foreground">
              既にプレミアムプランに登録済みの方
            </p>
            <Button
              variant="outline"
              className="w-full glass-button h-12 rounded-xl"
              type="button"
              onClick={handleGoToApp}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  確認中...
                </>
              ) : (
                <>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  AIツール使用画面へ移動
                </>
              )}
            </Button>
            
            {/* 決済済みなのに反映されない場合の手動同期ボタン */}
            {subscription?.status === "incomplete" && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground gap-2"
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    同期中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    決済済みなのに反映されない場合
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
