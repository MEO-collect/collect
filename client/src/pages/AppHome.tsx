import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Image
} from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
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
    <Card 
      className={`relative overflow-hidden transition-all duration-200 ${
        isLocked 
          ? "opacity-60 cursor-not-allowed" 
          : "hover:shadow-lg hover:scale-[1.02] cursor-pointer active:scale-[0.98]"
      }`}
      onClick={isLocked ? undefined : onClick}
    >
      {isLocked && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Lock className="h-6 w-6" />
            <span className="text-xs font-medium">Coming Soon</span>
          </div>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            {icon}
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}

export default function AppHome() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: subscription, isLoading: subscriptionLoading } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // 未認証の場合はログインページへ
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // プロファイル未登録の場合は登録ページへ
  useEffect(() => {
    if (!authLoading && !profileLoading && isAuthenticated && !profile) {
      setLocation("/register");
    }
  }, [authLoading, profileLoading, isAuthenticated, profile, setLocation]);

  // サブスクリプションがアクティブでない場合は登録ページへ
  useEffect(() => {
    if (!subscriptionLoading && subscription && subscription.status !== "active") {
      setLocation("/subscription");
    }
  }, [subscriptionLoading, subscription, setLocation]);

  const handleLogout = async () => {
    await logout();
    toast.success("ログアウトしました");
    setLocation("/");
  };

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
              onClick={() => window.location.href = getLoginUrl()}
            >
              ログイン
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const apps = [
    {
      id: "voice-transcription",
      title: "音声録音＆書き起こし＆要約",
      description: "音声を録音し、AIで書き起こし・要約・議事録・カルテを自動生成します",
      icon: <Mic className="h-5 w-5 text-primary" />,
      isLocked: false,
      path: "/app/voice",
    },
    {
      id: "document-analysis",
      title: "ドキュメント分析",
      description: "PDFや文書ファイルをAIで分析し、要約や質問応答を行います",
      icon: <FileText className="h-5 w-5 text-primary" />,
      isLocked: true,
    },
    {
      id: "chat-assistant",
      title: "AIチャットアシスタント",
      description: "ビジネスに特化したAIチャットボットで業務をサポートします",
      icon: <MessageSquare className="h-5 w-5 text-primary" />,
      isLocked: true,
    },
    {
      id: "data-analysis",
      title: "データ分析",
      description: "Excelやデータをアップロードして、AIで分析・可視化します",
      icon: <BarChart3 className="h-5 w-5 text-primary" />,
      isLocked: true,
    },
    {
      id: "image-generation",
      title: "画像生成",
      description: "テキストから高品質な画像をAIで生成します",
      icon: <Image className="h-5 w-5 text-primary" />,
      isLocked: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-semibold">BtoB AIプラットフォーム</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/settings")}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">
            こんにちは、{profile?.contactName || user?.name || "ユーザー"}さん
          </h1>
          <p className="text-muted-foreground">
            {profile?.companyName && `${profile.companyName} | `}
            利用可能なAIアプリをお選びください
          </p>
        </div>

        {/* App Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              title={app.title}
              description={app.description}
              icon={app.icon}
              isLocked={app.isLocked}
              onClick={app.path ? () => setLocation(app.path) : undefined}
            />
          ))}
        </div>

        {/* Subscription Info */}
        {subscription && (
          <div className="mt-8 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="text-muted-foreground">プラン: </span>
                <span className="font-medium">{subscription.planName}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">ステータス: </span>
                <span className={`font-medium ${
                  subscription.status === "active" ? "text-green-600" : "text-amber-600"
                }`}>
                  {subscription.status === "active" ? "有効" : subscription.status}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
