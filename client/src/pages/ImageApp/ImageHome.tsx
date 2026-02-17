import { Button } from "@/components/ui/button";
import { ArrowLeft, Wand2, Eraser, Sparkles, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

export default function ImageHome() {
  const [, navigate] = useLocation();
  const { isLoading: subLoading } = useSubscriptionGuard();

  if (subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const tools = [
    {
      id: "photo-editor",
      title: "フォトエディター",
      description: "AIが写真を美しく加工。明るさ・スタイル変換・背景処理・画質向上など、プロ級の編集を直感的に。",
      icon: <Wand2 className="h-8 w-8" />,
      gradient: "from-blue-500 to-indigo-600",
      path: "/app/image/editor",
    },
    {
      id: "magic-eraser",
      title: "マジック消しゴム",
      description: "消したい部分を指でなぞるだけ。AIが不要な物体を消去し、背景を自然に補完します。",
      icon: <Eraser className="h-8 w-8" />,
      gradient: "from-rose-500 to-pink-600",
      path: "/app/image/eraser",
    },
  ];

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      <div className="floating-orb w-72 h-72 bg-primary/15 top-[-5%] right-[-5%]" style={{ animationDelay: "0s" }} />
      <div className="floating-orb w-56 h-56 bg-blue-400/15 bottom-[5%] left-[-5%]" style={{ animationDelay: "3s" }} />

      {/* Header */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-14 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/home")}
            className="glass-button h-9 w-9 rounded-xl shrink-0"
            aria-label="ホームに戻る"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-base font-semibold">AI画像加工</h1>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container py-8 relative z-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">ツールを選択</h2>
          <p className="text-muted-foreground">
            AIの力で、誰でも簡単にプロ級の画像編集ができます
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 max-w-2xl">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => navigate(tool.path)}
              className="group text-left glass-card p-6 hover-lift focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.gradient} text-white mb-4 group-hover:scale-105 transition-transform`}>
                {tool.icon}
              </div>
              <h3 className="text-lg font-semibold mb-2">{tool.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {tool.description}
              </p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
