import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  });

  useEffect(() => {
    if (!authLoading && !profileLoading && !subscriptionLoading && isAuthenticated) {
      if (profile && subscription?.status === "active") {
        setLocation("/home");
      } else if (profile && !subscription?.status) {
        setLocation("/subscription");
      } else if (!profile) {
        setLocation("/register");
      }
    }
  }, [authLoading, profileLoading, subscriptionLoading, isAuthenticated, profile, subscription, setLocation]);

  const handleLogin = () => {
    window.location.href = getLoginUrl();
  };

  if (authLoading || (isAuthenticated && (profileLoading || subscriptionLoading))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-semibold">BtoB AIプラットフォーム</span>
          </div>
          <Button onClick={handleLogin} type="button">ログイン</Button>
        </div>
      </header>

      <section className="py-16 md:py-24">
        <div className="container text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" />
            AIで業務効率化
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            音声から議事録・カルテを<br />
            <span className="text-primary">自動生成</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            会議や面談の音声を録音するだけで、AIが自動で書き起こし、議事録やカルテを生成。業務時間を大幅に削減します。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={handleLogin} type="button">
              無料で始める<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              type="button"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
            >
              機能を見る
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="py-16 bg-muted/50">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">主な機能</h2>
            <p className="text-muted-foreground">AIの力で、音声データから価値ある情報を抽出します</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <Card key={index} className="bg-background">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-6">導入メリット</h2>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 flex-shrink-0 mt-0.5">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-muted rounded-xl p-8">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">¥0</div>
                <div className="text-muted-foreground mb-6">テスト期間中は無料</div>
                <Button className="w-full" size="lg" onClick={handleLogin} type="button">今すぐ始める</Button>
                <p className="text-xs text-muted-foreground mt-4">クレジットカード登録が必要です</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">今すぐ始めましょう</h2>
          <p className="mb-8 opacity-90">面倒な議事録作成から解放されて、本来の業務に集中しませんか？</p>
          <Button size="lg" variant="secondary" onClick={handleLogin} type="button">
            無料で始める<ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <footer className="py-8 border-t">
        <div className="container text-center text-sm text-muted-foreground">
          <p>&copy; 2025 BtoB AIプラットフォーム. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
