import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Check, CreditCard, Loader2, Shield, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

const features = [
  "音声録音・書き起こし・要約アプリ",
  "議事録自動生成",
  "カルテ作成（SOAP形式）",
  "話者識別・色分け表示",
  "Word形式エクスポート",
];

export default function Subscription() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: subscription, isLoading: subscriptionLoading } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createCheckout = trpc.subscription.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("決済ページに移動します");
        // 同じタブで遷移
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      console.error("Checkout error:", error);
      toast.error(error.message || "エラーが発生しました");
    },
  });

  const handleSubscribe = () => {
    console.log("Subscribe button clicked");
    createCheckout.mutate();
  };

  // プロファイル未登録の場合は登録ページへ
  useEffect(() => {
    if (!authLoading && !profileLoading && isAuthenticated && !profile) {
      setLocation("/register");
    }
  }, [authLoading, profileLoading, isAuthenticated, profile, setLocation]);

  // 既にアクティブなサブスクリプションがある場合はホームへ
  useEffect(() => {
    if (!subscriptionLoading && subscription?.status === "active") {
      setLocation("/home");
    }
  }, [subscriptionLoading, subscription, setLocation]);

  if (authLoading || profileLoading || subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">BtoB AIプラットフォーム</CardTitle>
            <CardDescription>
              サービスをご利用いただくにはログインが必要です
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              type="button"
              onClick={() => window.location.href = getLoginUrl()}
            >
              ログイン
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">プレミアムプランに登録</CardTitle>
          <CardDescription>
            5つのAIアプリを無制限にご利用いただけます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 価格表示 */}
          <div className="text-center p-6 bg-muted rounded-lg">
            <div className="text-4xl font-bold text-foreground">
              ¥0
              <span className="text-lg font-normal text-muted-foreground">/月</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              テスト期間中は無料でご利用いただけます
            </p>
          </div>

          {/* 機能一覧 */}
          <div className="space-y-3">
            {features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                  <Check className="h-3 w-3 text-primary" />
                </div>
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>

          {/* 契約条件 */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">ご契約条件</p>
                <ul className="list-disc list-inside space-y-1 text-amber-700">
                  <li>初回1年間は基本的に解約できません</li>
                  <li>初回期間中の解約は解約金が発生します</li>
                  <li>初回期間後はいつでも解約可能です</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 登録ボタン */}
          <Button 
            className="w-full"
            size="lg"
            type="button"
            onClick={handleSubscribe}
            disabled={createCheckout.isPending}
          >
            {createCheckout.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                処理中...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                サブスクリプションを開始
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            決済はStripeの安全な決済システムを使用しています
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
