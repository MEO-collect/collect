import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { 
  Loader2, 
  Lock, 
  LogOut, 
  Settings,
  AlertTriangle,
  CreditCard,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

interface AppCardProps {
  title: string;
  description: string;
  illustration: string;
  bgColor: string;
  textColor: string;
  isLocked?: boolean;
  lockReason?: string;
  onClick?: () => void;
}

function AppCard({ title, description, illustration, bgColor, textColor, isLocked = false, lockReason, onClick }: AppCardProps) {
  return (
    <div 
      className={`relative overflow-hidden rounded-3xl p-8 transition-all duration-300 ${bgColor} ${
        isLocked 
          ? "opacity-70 cursor-not-allowed" 
          : "hover:scale-[1.02] hover:shadow-2xl cursor-pointer"
      }`}
      onClick={isLocked ? undefined : onClick}
    >
      {isLocked && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 shadow-lg">
              <Lock className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-center bg-background/90 rounded-full py-2 px-4 shadow-lg">{lockReason || "利用不可"}</span>
          </div>
        </div>
      )}
      <div className="flex flex-col h-full">
        <div className="flex-1">
          <h3 className={`text-2xl font-bold mb-2 ${textColor}`}>{title}</h3>
          <p className={`text-sm leading-relaxed ${textColor} opacity-80`}>{description}</p>
        </div>
        <div className="mt-6 flex items-end justify-between">
          <img 
            src={illustration} 
            alt={title}
            className="w-32 h-32 object-contain opacity-90"
          />
          <ArrowRight className={`h-6 w-6 ${textColor} opacity-60`} />
        </div>
      </div>
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
        toast.error("既にアクティブなサブスクリプションがあります");
        refetchSubscription();
      } else {
        toast.error("決済ページの作成に失敗しました");
      }
    },
  });

  // Stripe同期
  const syncMutation = trpc.subscription.syncFromStripe.useMutation({
    onSuccess: (data) => {
        if (data.synced) {
          toast.success("同期が完了しました");
          refetchSubscription();
        } else {
          toast.error(data.message || "同期に失敗しました");
        }
    },
    onError: (error) => {
      console.error("Sync error:", error);
      toast.error("同期中にエラーが発生しました");
    },
    onSettled: () => {
      setIsSyncing(false);
    },
  });

  const handleSync = () => {
    setIsSyncing(true);
    syncMutation.mutate();
  };

  // リダイレクトロジック
  useEffect(() => {
    if (authLoading || subscriptionLoading || profileLoading) return;

    if (!isAuthenticated) {
      window.location.href = "/";
      return;
    }

    if (!subscription) {
      window.location.href = "/subscription";
      return;
    }

    if (!profile) {
      window.location.href = "/register";
      return;
    }
  }, [isAuthenticated, subscription, profile, authLoading, subscriptionLoading, profileLoading]);

  if (authLoading || subscriptionLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !subscription || !profile) {
    return null;
  }

  const isActive = subscription.status === "active";

  const apps = [
    {
      title: "音声録音＆書き起こし＆要約",
      description: "音声を録音し、AIで書き起こし・要約・議事録・カルテを自動生成します",
      illustration: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663284756942/JuUkSReKzgKUDUYg.svg",
      bgColor: "bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-950/40 dark:to-purple-900/40",
      textColor: "text-purple-900 dark:text-purple-100",
      path: "/voice-recorder",
    },
    {
      title: "AI文章作成",
      description: "SNS・ブログ・MEO用の文章をAIで自動生成。Instagram、LINE、ブログ、GBPに対応",
      illustration: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663284756942/kGdtAGzCIHlgvZtX.svg",
      bgColor: "bg-gradient-to-br from-pink-100 to-pink-200 dark:from-pink-950/40 dark:to-pink-900/40",
      textColor: "text-pink-900 dark:text-pink-100",
      path: "/bizwriter",
    },
    {
      title: "AI画像加工",
      description: "AIで写真を美しく加工。フォトエディター＆マジック消しゴムで、プロ級の画像編集を実現します",
      illustration: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663284756942/WkTajaVJpmHcQPOF.svg",
      bgColor: "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-950/40 dark:to-blue-900/40",
      textColor: "text-blue-900 dark:text-blue-100",
      path: "/image-editor",
    },
    {
      title: "カレンダーQRコード",
      description: "予定を選ぶだけでGoogleカレンダーやiPhoneカレンダーに登録できるQRコードを生成します",
      illustration: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663284756942/MVAKFJjruMnEpLbZ.svg",
      bgColor: "bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-950/40 dark:to-amber-900/40",
      textColor: "text-amber-900 dark:text-amber-100",
      path: "/calendar-qr",
    },
    {
      title: "商材ドクター",
      description: "営業資料をAIが分析・診断。契約リスクや相場との乖離をチェックします",
      illustration: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663284756942/ceHgsQSiNWJlByga.svg",
      bgColor: "bg-gradient-to-br from-green-100 to-green-200 dark:from-green-950/40 dark:to-green-900/40",
      textColor: "text-green-900 dark:text-green-100",
      path: "/material-doctor",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* ヘッダー */}
      <header className="border-b border-border/40 bg-background/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60">
              <span className="text-lg font-bold text-primary-foreground">B</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              BtoB AIプラットフォーム
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.href = "/settings"}
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="container mx-auto px-4 py-12">
        {/* ウェルカムセクション */}
        <div className="mb-12">
          <h2 className="text-4xl font-bold mb-3 bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
            こんにちは、{profile.contactName}さん
          </h2>
          <p className="text-lg text-muted-foreground">
            {profile.companyName} | 利用可能なAIアプリをお選びください
          </p>
        </div>

        {/* サブスクリプション警告バナー */}
        {!isActive && (
          <div className="mb-8 rounded-3xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-2 border-amber-200 dark:border-amber-800 p-6 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 shrink-0">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-2">
                  サブスクリプションが有効ではありません
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
                  現在のステータス: <span className="font-semibold">{subscription.status}</span>
                  {subscription.status === "incomplete" && " - 決済が完了していません"}
                  {subscription.status === "canceled" && " - サブスクリプションがキャンセルされています"}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => createCheckout.mutate()}
                    disabled={createCheckout.isPending}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {createCheckout.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        処理中...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        決済を完了する
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="border-amber-300 dark:border-amber-700"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        同期中...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Stripeと同期
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* アプリカードグリッド */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => (
            <AppCard
              key={app.path}
              title={app.title}
              description={app.description}
              illustration={app.illustration}
              bgColor={app.bgColor}
              textColor={app.textColor}
              isLocked={!isActive}
              lockReason={!isActive ? "プレミアムプラン登録が必要です" : undefined}
              onClick={() => {
                if (isActive) {
                  window.location.href = app.path;
                }
              }}
            />
          ))}
        </div>

        {/* プラン情報 */}
        <div className="mt-12 rounded-3xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900/40 dark:to-slate-800/40 border border-border/40 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">プラン</p>
              <p className="text-lg font-bold">BtoB AIプラットフォーム プレミアムプラン</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">ステータス</p>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isActive ? "bg-green-500" : "bg-amber-500"}`} />
                <p className="text-lg font-bold">{isActive ? "有効" : subscription.status}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
