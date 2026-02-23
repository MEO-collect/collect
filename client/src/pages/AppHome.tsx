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
  ArrowRight,
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
  onClick?: () => void;
}

function AppCard({ title, description, icon, isLocked = false, lockReason, onClick }: AppCardProps) {
  return (
    <div 
      className={`group relative bg-white border border-gray-200 rounded-xl p-8 transition-all duration-300 ${
        isLocked 
          ? "opacity-60 cursor-not-allowed" 
          : "hover:shadow-xl hover:-translate-y-1 cursor-pointer"
      }`}
      onClick={isLocked ? undefined : onClick}
    >
      {isLocked && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
          <div className="flex flex-col items-center gap-2 text-gray-600">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Lock className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-center">{lockReason || "利用不可"}</span>
          </div>
        </div>
      )}
      
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 flex h-14 w-14 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
        </div>
        {!isLocked && (
          <ArrowRight className="flex-shrink-0 h-5 w-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
        )}
      </div>
    </div>
  );
}

export default function AppHome() {
  const { user } = useAuth();
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(true);

  // ユーザープロフィール取得
  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery();

  // サブスクリプション情報取得
  const { 
    data: subscription, 
    isLoading: subscriptionLoading,
    refetch: refetchSubscription
  } = trpc.subscription.get.useQuery();

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
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  // サブスクリプションチェック完了
  useEffect(() => {
    if (!subscriptionLoading) {
      setIsCheckingSubscription(false);
    }
  }, [subscriptionLoading]);

  const isSubscribed = subscription?.status === "active";
  const isIncomplete = subscription?.status === "incomplete" || subscription?.status === "incomplete_expired";
  const isCanceled = subscription?.status === "canceled";

  // アプリ一覧
  const apps = [
    {
      title: "音声録音&書き起こし&要約",
      description: "音声を録音し、AIで書き起こし・要約・議事録・カルテを自動生成します",
      icon: <Mic className="h-7 w-7" />,
      path: "/app/voice",
      requiresSubscription: false,
    },
    {
      title: "AI文章作成",
      description: "SNS・ブログ・MEO用の文章をAIで自動生成。Instagram、LINE、ブログ、GBPに対応",
      icon: <Sparkles className="h-7 w-7" />,
      path: "/app/bizwriter",
      requiresSubscription: false,
    },
    {
      title: "AI画像加工",
      description: "AIで写真を美しく加工。フォトエディター&マジック消しゴムで、プロ級の画像編集を実現します",
      icon: <Image className="h-7 w-7" />,
      path: "/app/image",
      requiresSubscription: false,
    },
    {
      title: "カレンダーQRコード",
      description: "予定を選ぶだけでGoogleカレンダーやiPhoneカレンダーに登録できるQRコードを生成します",
      icon: <QrCode className="h-7 w-7" />,
      path: "/app/calendar-qr",
      requiresSubscription: false,
    },
    {
      title: "商材ドクター",
      description: "営業資料をAIが分析・診断。契約リスクや相場との乖離をチェックします",
      icon: <Stethoscope className="h-7 w-7" />,
      path: "/app/shozai-doctor",
      requiresSubscription: false,
    },
  ];

  if (profileLoading || isCheckingSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto" />
          <h2 className="text-2xl font-bold text-gray-900">プロフィールが見つかりません</h2>
          <p className="text-gray-600">プロフィールを設定してください</p>
          <Button onClick={() => window.location.href = "/settings"}>
            設定画面へ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-lg">
                B
              </div>
              <h1 className="text-xl font-bold text-gray-900">BtoB AIプラットフォーム</h1>
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
                onClick={() => window.location.href = "/api/auth/logout"}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="container mx-auto px-6 py-12">
        {/* ウェルカムセクション */}
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-3">
            こんにちは、{profile.contactName}さん
          </h2>
          <p className="text-lg text-gray-600">
            {profile.companyName} | 利用可能なAIアプリをお選びください
          </p>
        </div>

        {/* サブスクリプション警告 */}
        {(isIncomplete || isCanceled) && (
          <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-amber-900 mb-2">
                  {isIncomplete ? "決済が未完了です" : "サブスクリプションがキャンセルされています"}
                </h3>
                <p className="text-sm text-amber-800 mb-4">
                  {isIncomplete 
                    ? "決済を完了してプレミアム機能をご利用ください。" 
                    : "プレミアム機能を再度利用するには、サブスクリプションを再開してください。"}
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => window.location.href = "/subscription"}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    {isIncomplete ? "決済を完了する" : "サブスクリプションを再開"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSync}
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? (
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
              icon={app.icon}
              isLocked={app.requiresSubscription && !isSubscribed}
              lockReason={app.requiresSubscription && !isSubscribed ? "プレミアムプラン限定" : undefined}
              onClick={() => window.location.href = app.path}
            />
          ))}
        </div>

        {/* サブスクリプション情報 */}
        <div className="mt-12 bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                プラン: {isSubscribed ? "BtoB AIプラットフォーム プレミアムプラン" : "フリープラン"}
              </h3>
              <p className="text-sm text-gray-600">
                ステータス: {isSubscribed ? (
                  <span className="text-green-600 font-medium">有効</span>
                ) : (
                  <span className="text-gray-500">未加入</span>
                )}
              </p>
            </div>
            {!isSubscribed && (
              <Button
                onClick={() => window.location.href = "/subscription"}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                プレミアムプランに登録
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
