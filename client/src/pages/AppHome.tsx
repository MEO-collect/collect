import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { 
  FileText, 
  Loader2, 
  Lock, 
  LogOut, 
  Mic, 
  Settings, 
  Sparkles,
  MessageSquare,
  BarChart3,
  Image,
  QrCode
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

interface AppCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  isLocked?: boolean;
  onClick?: () => void;
}

function AppCard({ title, description, icon, isLocked = false, onClick }: AppCardProps) {
  return (
    <div 
      className={`relative overflow-hidden glass-card p-6 ${
        isLocked 
          ? "opacity-70 cursor-not-allowed" 
          : "hover-lift cursor-pointer"
      }`}
      onClick={isLocked ? undefined : onClick}
    >
      {isLocked && (
        <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px] z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 backdrop-blur-sm">
              <Lock className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium">Coming Soon</span>
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
 * URLパラメータには一切依存しない。
 */
export default function AppHome() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: subscription, isLoading: subscriptionLoading } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // 未ログインの場合はランディングページへ
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/";
    }
  }, [authLoading, isAuthenticated]);

  // サブスクリプションがない場合は /subscription へ
  useEffect(() => {
    if (authLoading || subscriptionLoading) return;
    if (!isAuthenticated) return;
    if (!subscription) {
      window.location.href = "/subscription";
    }
  }, [authLoading, subscriptionLoading, isAuthenticated, subscription]);

  // サブスクリプションはあるがプロファイルがない場合は /register へ
  useEffect(() => {
    if (authLoading || subscriptionLoading || profileLoading) return;
    if (!isAuthenticated) return;
    if (subscription && !profile) {
      window.location.href = "/register";
    }
  }, [authLoading, subscriptionLoading, profileLoading, isAuthenticated, subscription, profile]);

  const handleLogout = async () => {
    await logout();
    toast.success("ログアウトしました");
    window.location.href = "/";
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

  const apps = [
    {
      id: "voice-transcription",
      title: "音声録音＆書き起こし＆要約",
      description: "音声を録音し、AIで書き起こし・要約・議事録・カルテを自動生成します",
      icon: <Mic className="h-6 w-6 text-primary" />,
      isLocked: false,
      path: "/app/voice",
    },
    {
      id: "document-analysis",
      title: "ドキュメント分析",
      description: "PDFや文書ファイルをAIで分析し、要約や質問応答を行います",
      icon: <FileText className="h-6 w-6 text-primary" />,
      isLocked: true,
    },
    {
      id: "chat-assistant",
      title: "AIチャットアシスタント",
      description: "ビジネスに特化したAIチャットボットで業務をサポートします",
      icon: <MessageSquare className="h-6 w-6 text-primary" />,
      isLocked: true,
    },
    {
      id: "data-analysis",
      title: "データ分析",
      description: "Excelやデータをアップロードして、AIで分析・可視化します",
      icon: <BarChart3 className="h-6 w-6 text-primary" />,
      isLocked: true,
    },
    {
      id: "image-editor",
      title: "AI画像加工",
      description: "AIで写真を美しく加工。フォトエディター＆マジック消しゴムで、プロ級の画像編集を実現します",
      icon: <Image className="h-6 w-6 text-primary" />,
      isLocked: false,
      path: "/app/image",
    },
    {
      id: "calendar-qr",
      title: "カレンダーQRコード",
      description: "予定を選ぶだけでGoogleカレンダーやiPhoneカレンダーに登録できるQRコードを生成します",
      icon: <QrCode className="h-6 w-6 text-primary" />,
      isLocked: false,
      path: "/app/calendar-qr",
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
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-3">
            こんにちは、{profile?.contactName || user?.name || "ユーザー"}さん
          </h1>
          <p className="text-muted-foreground text-lg">
            {profile?.companyName && `${profile.companyName} | `}
            利用可能なAIアプリをお選びください
          </p>
        </div>

        {/* アプリグリッド */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              title={app.title}
              description={app.description}
              icon={app.icon}
              isLocked={app.isLocked}
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
                <span className={`font-semibold ${
                  subscription.status === "active" 
                    ? "text-emerald-600" 
                    : "text-amber-600"
                }`}>
                  {subscription.status === "active" ? "有効" : 
                   subscription.status === "incomplete" ? "処理中" : subscription.status}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
