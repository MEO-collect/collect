import { Button } from "@/components/ui/button";
import { CheckCircle2, Home, Loader2, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
// utilsは使用しないので削除

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const [isChecking, setIsChecking] = useState(true);


  // サブスクリプション状態を確認
  const { data: subscription, refetch: refetchSubscription } = trpc.subscription.get.useQuery(undefined, {
    refetchOnMount: 'always',
  });

  // プロファイル状態を確認
  const { data: profile, refetch: refetchProfile } = trpc.profile.get.useQuery(undefined, {
    refetchOnMount: 'always',
  });

  useEffect(() => {
    // ページ表示時にサブスクリプション状態とプロファイルを再取得
    const checkStatus = async () => {
      console.log("Checking subscription and profile status after payment...");
      
      // 少し待ってからサブスクリプション状態を確認
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // サブスクリプション状態とプロファイルを再取得
      await refetchSubscription();
      await refetchProfile();
      
      setIsChecking(false);
    };

    checkStatus();
  }, [refetchSubscription, refetchProfile]);

  // サブスクリプションとプロファイルの状態に応じて自動遷移
  useEffect(() => {
    if (!isChecking) {
      if (subscription?.status === "active") {
        // サブスクリプションがアクティブな場合
        if (profile) {
          // プロファイルがある場合はホームへ
          console.log("Subscription active and profile exists, redirecting to /home");
          setLocation("/home");
        } else {
          // プロファイルがない場合は会員登録へ
          console.log("Subscription active but no profile, redirecting to /register");
          setLocation("/register");
        }
      }
    }
  }, [isChecking, subscription, profile, setLocation]);

  const handleContinue = () => {
    // プロファイルがある場合はホームへ、ない場合は会員登録へ
    if (profile) {
      window.location.href = "/home";
    } else {
      window.location.href = "/register";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-mesh p-4 relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div className="floating-orb w-72 h-72 bg-green-400/20 top-[-5%] right-[-10%]" style={{ animationDelay: '0s' }} />
      <div className="floating-orb w-56 h-56 bg-primary/20 bottom-[-5%] left-[-5%]" style={{ animationDelay: '2s' }} />
      <div className="floating-orb w-40 h-40 bg-emerald-400/15 top-[40%] left-[10%]" style={{ animationDelay: '4s' }} />

      <div className="glass-card w-full max-w-md p-8 text-center relative z-10">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100/80 backdrop-blur-sm">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">決済完了</h1>
        <p className="text-muted-foreground mb-6">
          サブスクリプションの決済が完了しました
        </p>
        
        <div className="p-5 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/30 mb-6">
          <p className="text-sm text-muted-foreground">
            {profile 
              ? "AIアプリをご利用いただけます。" 
              : "次に会員情報を登録して、AIアプリをご利用いただけるようになります。"}
          </p>
        </div>
        
        {isChecking ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>登録状態を確認中...</span>
          </div>
        ) : (
          <Button 
            className="w-full btn-gradient text-white border-0 h-14 text-lg rounded-xl"
            type="button"
            onClick={handleContinue}
          >
            {profile ? (
              <>
                <Home className="mr-2 h-5 w-5" />
                ホームへ進む
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-5 w-5" />
                会員情報を登録する
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
