import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  BarChart3, 
  Check, 
  FileText, 
  Loader2, 
  MessageSquare, 
  Mic, 
  Sparkles
} from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";

const features = [
  {
    icon: <Mic className="h-6 w-6" />,
    title: "音声録音＆書き起こし",
    description: "高精度なAI音声認識で、会議や面談の内容を自動でテキスト化",
  },
  {
    icon: <FileText className="h-6 w-6" />,
    title: "議事録・カルテ自動生成",
    description: "書き起こしテキストから、議事録やSOAP形式のカルテを自動生成",
  },
  {
    icon: <MessageSquare className="h-6 w-6" />,
    title: "話者識別・色分け表示",
    description: "複数の話者を自動で識別し、見やすく色分けして表示",
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: "要約・分析機能",
    description: "長時間の会議内容も、重要ポイントを抽出して簡潔に要約",
  },
];

const benefits = [
  "会議の議事録作成時間を大幅削減",
  "医療現場でのカルテ作成を効率化",
  "話者ごとの発言を自動で整理",
  "Word形式でのエクスポート対応",
  "セキュアなデータ管理",
];

export default function Home() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: subscription, isLoading: subscriptionLoading } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) return;
    if (subscriptionLoading || profileLoading) return;
    
    if (!subscription || subscription.status !== "active") {
      setLocation("/subscription");
      return;
    }
    
    if (!profile) {
      setLocation("/register");
    } else {
      setLocation("/home");
    }
  }, [authLoading, profileLoading, subscriptionLoading, isAuthenticated, profile, subscription, setLocation]);

  const handleLogin = () => {
    window.location.href = getLoginUrl();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (isAuthenticated && (profileLoading || subscriptionLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div className="floating-orb w-96 h-96 bg-primary/20 top-[-10%] right-[-5%]" style={{ animationDelay: '0s' }} />
      <div className="floating-orb w-80 h-80 bg-blue-400/20 bottom-[10%] left-[-10%]" style={{ animationDelay: '2s' }} />
      <div className="floating-orb w-64 h-64 bg-purple-400/20 top-[40%] right-[10%]" style={{ animationDelay: '4s' }} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 backdrop-blur-sm">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold text-lg">BtoB AIプラットフォーム</span>
          </div>
          <Button 
            onClick={handleLogin} 
            type="button"
            className="btn-gradient text-white border-0 px-6"
          >
            ログイン
          </Button>
        </div>
      </header>

      {/* ヒーローセクション */}
      <section className="py-20 md:py-32 relative">
        <div className="container text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card text-primary text-sm font-medium mb-8">
            <Sparkles className="h-4 w-4" />
            AIで業務効率化
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-8 leading-tight">
            音声から議事録・カルテを<br />
            <span className="text-gradient">自動生成</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            会議や面談の音声を録音するだけで、AIが自動で書き起こし、議事録やカルテを生成。業務時間を大幅に削減します。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={handleLogin} 
              type="button"
              className="btn-gradient text-white border-0 px-8 py-6 text-lg"
            >
              無料で始める
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              type="button"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="glass-button px-8 py-6 text-lg"
            >
              機能を見る
            </Button>
          </div>
        </div>
      </section>

      {/* 機能セクション */}
      <section id="features" className="py-20 relative">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">主な機能</h2>
            <p className="text-muted-foreground text-lg">AIの力で、音声データから価値ある情報を抽出します</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="glass-card p-6 hover-lift"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm text-primary mb-5">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* メリットセクション */}
      <section className="py-20 relative">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-8">導入メリット</h2>
              <ul className="space-y-5">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-4">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 backdrop-blur-sm flex-shrink-0 mt-0.5">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-lg">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass-card p-10">
              <div className="text-center">
                <div className="text-5xl font-bold text-gradient mb-3">¥0</div>
                <div className="text-muted-foreground text-lg mb-8">テスト期間中は無料</div>
                <Button 
                  className="w-full btn-gradient text-white border-0 py-6 text-lg" 
                  size="lg" 
                  onClick={handleLogin} 
                  type="button"
                >
                  今すぐ始める
                </Button>
                <p className="text-sm text-muted-foreground mt-5">クレジットカード登録が必要です</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTAセクション */}
      <section className="py-20 relative">
        <div className="container">
          <div className="glass-card p-12 md:p-16 text-center relative overflow-hidden">
            {/* 背景装飾 */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-purple-500/10 pointer-events-none" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-5">今すぐ始めましょう</h2>
              <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
                面倒な議事録作成から解放されて、本来の業務に集中しませんか？
              </p>
              <Button 
                size="lg" 
                onClick={handleLogin} 
                type="button"
                className="btn-gradient text-white border-0 px-10 py-6 text-lg"
              >
                無料で始める
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="py-10 relative">
        <div className="container">
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              &copy; 2025 BtoB AIプラットフォーム. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
