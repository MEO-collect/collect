import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { 
  Loader2, 
  Lock, 
  LogOut, 
  Mic, 
  Settings, 
  Sparkles,
  Image,
  QrCode,
  PenTool,
  Stethoscope,
  AlertTriangle,
  CreditCard,
  RefreshCw,
  Coins,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

interface AppCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  isLocked?: boolean;
  lockReason?: string;
  isComingSoon?: boolean;
  onClick?: () => void;
}

function AppCard({ title, description, icon, isLocked = false, lockReason, isComingSoon = false, onClick }: AppCardProps) {
  return (
    <div 
      className={`relative overflow-hidden glass-card p-6 ${
        isLocked || isComingSoon
          ? "opacity-70 cursor-not-allowed" 
          : "hover-lift cursor-pointer"
      }`}
      onClick={isLocked || isComingSoon ? undefined : onClick}
    >
      {isComingSoon && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs font-medium text-center bg-primary/10 text-primary rounded-full py-1 px-3">Coming Soon</span>
          </div>
        </div>
      )}
      {isLocked && !isComingSoon && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/80">
              <Lock className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-center bg-background/80 rounded-full py-1 px-3">{lockReason || "利用不可"}</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm">
          {icon}
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

/**
 * ホーム画面（AIアプリ一覧）
 * 
 * リダイレクトルール（シンプル）：
 * - 未ログイン → / (ランディング)
 * - ログイン済み＋サブスクリプションなし → /subscription
 * - ログイン済み＋サブスクリプションあり＋プロファイルなし → /register
 * - ログイン済み＋サブスクリプションあり＋プロファイルあり → このページを表示
 * 
 * サブスクリプションがアクティブでない場合：
 * - アプリカードはロック表示（利用不可）
 * - 上部に案内バナーを表示
 * - 「決済を完了する」ボタンはStripe Checkoutに直接遷移
 */
export default function AppHome() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: tokenBalance } = trpc.tokens.getBalance.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 60000,
  });
  const grantMonthly = trpc.tokens.grantMonthly.useMutation();
  useEffect(() => {
    if (isAuthenticated) {
      grantMonthly.mutate();
    }
  }, [isAuthenticated]);

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
  });

  // Stripe Checkoutセッション作成
  const createCheckout = trpc.subscription.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("決済ページに移動します");
        window.open(data.url, "_blank");
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

  // サブスクリプション同期
  const syncFromStripe = trpc.subscription.syncFromStripe.useMutation();

  // 未ログインの場合はランディングページへ
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/";
    }
  }, [authLoading, isAuthenticated]);

  // サブスクリプションがない、またはincomplete/canceled/incomplete_expired の場合は /subscription へ
  useEffect(() => {
    if (authLoading || subscriptionLoading) return;
    if (!isAuthenticated) return;
    
    if (!subscription) {
      // サブスクリプションレコードなし → サブスクリプションページへ
      window.location.href = "/subscription";
    } else if (
      subscription.status === "incomplete" || 
      subscription.status === "incomplete_expired" ||
      subscription.status === "canceled"
    ) {
      // 未完了/解約済み → サブスクリプションページへ（再決済を促す）
      window.location.href = "/subscription";
    }
  }, [authLoading, subscriptionLoading, isAuthenticated, subscription]);

  // サブスクリプションはあるがプロファイルがない場合は /register へ
  useEffect(() => {
    if (authLoading || subscriptionLoading || profileLoading) return;
    if (!isAuthenticated) return;
    if (subscription && subscription.status === "active" && !profile) {
      window.location.href = "/register";
    }
  }, [authLoading, subscriptionLoading, profileLoading, isAuthenticated, subscription, profile]);

  // タブ復帰時にサブスクリプション状態を再取得
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        refetchSubscription();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated, refetchSubscription]);

  const handleLogout = async () => {
    await logout();
    toast.success("ログアウトしました");
    window.location.href = "/";
  };

  // 「決済を完了する」ボタン：Stripe Checkoutに直接遷移
  const handleCompletePayment = () => {
    createCheckout.mutate();
  };

  // 手動同期ボタン：Stripeの最新状態をDBに反映
  const handleSyncSubscription = async () => {
    setIsSyncing(true);
    try {
      const result = await syncFromStripe.mutateAsync();
      await refetchSubscription();
      if (result.synced) {
        toast.success(result.message || "サブスクリプション情報を同期しました");
      } else {
        toast.info(result.message || "最新の状態に更新しました");
      }
    } catch (err) {
      console.error("Sync error:", err);
      toast.error("同期に失敗しました。しばらく経ってから再度お試しください。");
    } finally {
      setIsSyncing(false);
    }
  };

  if (authLoading || profileLoading || subscriptionLoading) {
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
      <div className="min-h-screen flex items-center justify-center gradient-mesh p-4">
        <div className="glass-card w-full max-w-md p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm mx-auto mb-6">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-3">BtoB AIプラットフォーム</h1>
          <p className="text-muted-foreground mb-8">
            サービスをご利用いただくにはログインが必要です
          </p>
          <Button 
            className="w-full btn-gradient text-white border-0 py-6" 
            onClick={() => window.location.href = getLoginUrl()}
          >
            ログイン
          </Button>
        </div>
      </div>
    );
  }

  // サブスクリプションまたはプロファイルがない場合はローディング表示（リダイレクト待ち）
  if (!subscription || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // サブスクリプションがアクティブかどうか
  const isSubscriptionActive = subscription.status === "active";

  // ステータスに応じた日本語表示とメッセージ
  const getStatusInfo = () => {
    switch (subscription.status) {
      case "active":
        return { label: "有効", color: "text-emerald-600", message: "" };
      case "incomplete":
        return { 
          label: "決済未完了", 
          color: "text-amber-600", 
          message: "サブスクリプションの決済が完了していません。決済を完了してアプリをご利用ください。" 
        };
      case "past_due":
        return { 
          label: "支払い遅延", 
          color: "text-red-600", 
          message: "お支払いが遅延しています。設定画面からお支払い情報を更新してください。" 
        };
      case "canceled":
        return { 
          label: "解約済み", 
          color: "text-gray-500", 
          message: "サブスクリプションが解約されています。再度ご利用いただくには新しいプランにお申し込みください。" 
        };
      case "unpaid":
        return { 
          label: "未払い", 
          color: "text-red-600", 
          message: "お支払いが確認できません。設定画面からお支払い情報を更新してください。" 
        };
      default:
        return { 
          label: subscription.status, 
          color: "text-amber-600", 
          message: "サブスクリプションの状態を確認してください。" 
        };
    }
  };

  const statusInfo = getStatusInfo();

  const lockReason = !isSubscriptionActive 
    ? "サブスクリプションが有効ではありません" 
    : undefined;

  const apps = [
    {
      id: "voice-transcription",
      title: "音声録音＆書き起こし＆要約",
      description: "音声を録音し、AIで書き起こし・要約・議事録・カルテを自動生成します",
      icon: <Mic className="h-6 w-6 text-primary" />,
      isLocked: !isSubscriptionActive,
      path: "/app/voice",
    },
    {
      id: "bizwriter",
      title: "AI文章作成",
      description: "SNS・ブログ・MEO用の文章をAIで自動生成。Instagram、LINE、ブログ、GBPに対応",
      icon: <PenTool className="h-6 w-6 text-primary" />,
      isLocked: false,
      isComingSoon: true,
      path: "/app/bizwriter",
    },
    {
      id: "image-editor",
      title: "AI画像加工",
      description: "AIで写真を美しく加工。フォトエディター＆マジック消しゴムで、プロ級の画像編集を実現します",
      icon: <Image className="h-6 w-6 text-primary" />,
      isLocked: false,
      isComingSoon: true,
      path: "/app/image",
    },
    {
      id: "calendar-qr",
      title: "カレンダーQRコード",
      description: "予定を選ぶだけでGoogleカレンダーやiPhoneカレンダーに登録できるQRコードを生成します",
      icon: <QrCode className="h-6 w-6 text-primary" />,
      isLocked: !isSubscriptionActive,
      path: "/app/calendar-qr",
    },
    {
      id: "shozai-doctor",
      title: "商材ドクター",
      description: "営業資料をAIが分析・診断。契約リスクや相場との乖離をチェックします",
      icon: <Stethoscope className="h-6 w-6 text-primary" />,
      isLocked: !isSubscriptionActive,
      path: "/app/shozai-doctor",
    },
  ];

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div className="floating-orb w-80 h-80 bg-primary/15 top-[-5%] right-[-5%]" style={{ animationDelay: '0s' }} />
      <div className="floating-orb w-64 h-64 bg-blue-400/15 bottom-[5%] left-[-5%]" style={{ animationDelay: '3s' }} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 backdrop-blur-sm">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold text-lg">BtoB AIプラットフォーム</span>
          </div>
          <div className="flex items-center gap-2">
            {/* トークン残高バッジ */}
            <button
              onClick={() => { window.location.href = "/tokens"; }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-button text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              <Coins className="h-4 w-4 text-primary" />
              <span className="text-primary font-bold">
                {tokenBalance ? (tokenBalance.monthlyBalance + tokenBalance.bonusBalance).toLocaleString() : "—"}
              </span>
              <span className="text-muted-foreground text-xs">T</span>
            </button>
            <Button 
              variant="ghost" 
              size="icon" 
              type="button"
              onClick={() => { window.location.href = "/settings"; }}
              className="glass-button h-10 w-10 rounded-xl"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              className="glass-button h-10 w-10 rounded-xl"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="container py-8 relative z-10">
        {/* ウェルカムセクション */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-3">
            こんにちは、{profile?.contactName || user?.name || "ユーザー"}さん
          </h1>
          <p className="text-muted-foreground text-lg">
            {profile?.companyName && `${profile.companyName} | `}
            {isSubscriptionActive 
              ? "利用可能なAIアプリをお選びください" 
              : "サブスクリプションを有効にしてアプリをご利用ください"}
          </p>
        </div>

        {/* サブスクリプション非アクティブ時の案内バナー */}
        {!isSubscriptionActive && (
          <div className="mb-8 glass-card p-5 border-l-4 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-800 dark:text-amber-400 mb-1">
                  サブスクリプションが有効ではありません
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300/80 mb-4">
                  {statusInfo.message}
                </p>
                <div className="flex flex-wrap gap-3">
                  {/* incomplete: Stripe Checkoutに直接遷移して決済を完了 */}
                  {subscription.status === "incomplete" && (
                    <Button 
                      size="sm"
                      className="btn-gradient text-white border-0 gap-2"
                      onClick={handleCompletePayment}
                      disabled={createCheckout.isPending}
                    >
                      {createCheckout.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          処理中...
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4" />
                          決済を完了する
                        </>
                      )}
                    </Button>
                  )}
                  {/* canceled / incomplete_expired: 新しいCheckoutセッションを作成 */}
                  {(subscription.status === "canceled" || subscription.status === "incomplete_expired") && (
                    <Button 
                      size="sm"
                      className="btn-gradient text-white border-0 gap-2"
                      onClick={handleCompletePayment}
                      disabled={createCheckout.isPending}
                    >
                      {createCheckout.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          処理中...
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4" />
                          新しいプランに申し込む
                        </>
                      )}
                    </Button>
                  )}
                  {/* past_due / unpaid: 設定画面へ */}
                  {(subscription.status === "past_due" || subscription.status === "unpaid") && (
                    <Button 
                      size="sm"
                      className="btn-gradient text-white border-0 gap-2"
                      onClick={() => { window.location.href = "/settings"; }}
                    >
                      <CreditCard className="h-4 w-4" />
                      お支払い情報を更新
                    </Button>
                  )}
                  {/* 手動同期ボタン：決済済みなのに反映されない場合 */}
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="gap-2"
                    onClick={handleSyncSubscription}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        同期中...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        状態を更新
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="gap-2"
                    onClick={() => { window.location.href = "/settings"; }}
                  >
                    <Settings className="h-4 w-4" />
                    設定を確認
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* アプリグリッド */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              title={app.title}
              description={app.description}
              icon={app.icon}
              isLocked={app.isLocked && !app.isComingSoon}
              isComingSoon={app.isComingSoon}
              lockReason={lockReason}
              onClick={app.path ? () => { window.location.href = app.path; } : undefined}
            />
          ))}
        </div>

        {/* サブスクリプション情報 */}
        {subscription && (
          <div className="mt-10 glass-card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm">
                <span className="text-muted-foreground">プラン: </span>
                <span className="font-medium">{subscription.planName}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">ステータス: </span>
                <span className={`font-semibold ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
