import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Check, CreditCard, Loader2, Shield, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

const features = [
  "音声録音・書き起こし・要約アプリ",
  "議事録自動生成",
  "カルテ作成（SOAP形式）",
  "話者識別・色分け表示",
  "Word形式エクスポート",
];

export default function Subscription() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [skipRedirect, setSkipRedirect] = useState(false);

  // URLパラメータでforce=trueがある場合はリダイレクトをスキップ
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get('force') === 'true') {
      setSkipRedirect(true);
    }
  }, [searchString]);

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const createCheckout = trpc.subscription.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("決済ページに移動します");
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      console.error("Checkout error:", error);
      toast.error(error.message || "エラーが発生しました");
    },
  });

  const handleSubscribe = () => {
    // 二重払い防止：既にサブスクリプションが存在する場合はStripeに移行しない
    if (subscription) {
      toast.info("既にサブスクリプションに登録済みです。AIツール画面に移動します。");
      setLocation("/home");
      return;
    }
    createCheckout.mutate();
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (skipRedirect) return; // force=trueの場合はリダイレクトしない
    if (!authLoading && isAuthenticated && !subscriptionLoading && !profileLoading && subscription?.status === "active") {
      if (!profile) {
        setLocation("/register");
      } else {
        setLocation("/home");
      }
    }
  }, [authLoading, isAuthenticated, subscriptionLoading, profileLoading, subscription, profile, setLocation, skipRedirect]);

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
          {subscription ? (
            // 既にサブスクリプションがある場合は登録済み表示
            <div className="p-5 rounded-2xl bg-green-50/80 backdrop-blur-sm border border-green-200/50 text-center">
              <div className="flex items-center justify-center gap-2 text-green-700 mb-2">
                <Check className="h-5 w-5" />
                <span className="font-semibold">登録済み</span>
              </div>
              <p className="text-sm text-green-600">
                既にサブスクリプションに登録されています
              </p>
            </div>
          ) : (
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
                  サブスクリプションを開始
                </>
              )}
            </Button>
          )}

          <p className="text-xs text-center text-muted-foreground">
            決済はStripeの安全な決済システムを使用しています
          </p>

          {/* 登録済みユーザー向けリンク */}
          <div className="pt-4 border-t border-white/30">
            <p className="text-sm text-center text-muted-foreground mb-3">
              既にプレミアムプランに登録済みの方
            </p>
            <Button
              variant="outline"
              className="w-full glass-button h-12 rounded-xl"
              type="button"
              onClick={() => {
                // プロファイルがない場合は登録画面へ、ある場合はホームへ
                // skip=trueパラメータを追加してサブスクリプションチェックをスキップ
                if (!profile) {
                  window.location.href = "/register";
                } else {
                  window.location.href = "/home?skip=true";
                }
              }}
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              AIツール使用画面へ移動
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
