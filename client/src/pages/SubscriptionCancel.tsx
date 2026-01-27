import { Button } from "@/components/ui/button";
import { Home, RefreshCw, XCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function SubscriptionCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center gradient-mesh p-4 relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div className="floating-orb w-72 h-72 bg-amber-400/20 top-[-5%] left-[-10%]" style={{ animationDelay: '0s' }} />
      <div className="floating-orb w-56 h-56 bg-orange-400/20 bottom-[-5%] right-[-5%]" style={{ animationDelay: '2s' }} />
      <div className="floating-orb w-40 h-40 bg-yellow-400/15 top-[40%] right-[10%]" style={{ animationDelay: '4s' }} />

      <div className="glass-card w-full max-w-md p-8 text-center relative z-10">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100/80 backdrop-blur-sm">
          <XCircle className="h-12 w-12 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">登録がキャンセルされました</h1>
        <p className="text-muted-foreground mb-6">
          サブスクリプションの登録がキャンセルされました
        </p>
        
        <div className="p-5 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/30 mb-6">
          <p className="text-sm text-muted-foreground">
            ご不明な点がございましたら、お気軽にお問い合わせください。
          </p>
        </div>
        
        <div className="flex flex-col gap-3">
          <Button 
            className="w-full btn-gradient text-white border-0 h-14 text-lg rounded-xl"
            onClick={() => setLocation("/subscription")}
          >
            <RefreshCw className="mr-2 h-5 w-5" />
            もう一度試す
          </Button>
          <Button 
            variant="outline"
            className="w-full glass-button h-12 rounded-xl"
            onClick={() => setLocation("/home")}
          >
            <Home className="mr-2 h-4 w-4" />
            ホームへ戻る
          </Button>
        </div>
      </div>
    </div>
  );
}
