import { Button } from "@/components/ui/button";
import { CheckCircle2, Home, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * 決済完了ページ
 * 
 * Stripe決済完了後にリダイレクトされるページ。
 * 1. URLからsession_idを取得
 * 2. verifySession APIを呼び出してサブスクリプションをDBに同期
 * 3. プロファイルの有無で次の遷移先を決定
 */
export default function SubscriptionSuccess() {
  const [isChecking, setIsChecking] = useState(true);
  const [syncError, setSyncError] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // URLからsession_idを取得
  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const sessionId = searchParams.get("session_id") || undefined;

  // プロファイル状態を確認
  const { data: profile, refetch: refetchProfile } = trpc.profile.get.useQuery(undefined, {
    refetchOnMount: 'always',
  });

  // サブスクリプション同期API
  const verifySession = trpc.subscription.verifySession.useMutation();
  const syncFromStripe = trpc.subscription.syncFromStripe.useMutation();

  const performSync = async () => {
    console.log("Syncing subscription from Stripe session...", sessionId);
    
    try {
      // Strategy 1: Verify via session ID
      const result = await verifySession.mutateAsync({ sessionId });
      console.log("Verify session result:", result);
      
      if (result.synced && result.status === "active") {
        setSyncSuccess(true);
        setSyncError(false);
        return true;
      }
    } catch (err) {
      console.error("Failed to verify session:", err);
    }

    try {
      // Strategy 2: Sync from Stripe customer data
      const syncResult = await syncFromStripe.mutateAsync();
      console.log("SyncFromStripe result:", syncResult);
      
      if (syncResult.synced && (syncResult.status === "active" || syncResult.status === "trialing")) {
        setSyncSuccess(true);
        setSyncError(false);
        return true;
      }
    } catch (err) {
      console.error("Failed to sync from Stripe:", err);
    }

    setSyncError(true);
    return false;
  };

  useEffect(() => {
    const syncAndCheck = async () => {
      await performSync();
      await refetchProfile();
      setIsChecking(false);
    };

    // Wait for webhook processing
    const timer = setTimeout(syncAndCheck, 2000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetrySync = async () => {
    setIsRetrying(true);
    const success = await performSync();
    await refetchProfile();
    setIsRetrying(false);
    if (success) {
      toast.success("サブスクリプションが正常に同期されました");
    } else {
      toast.info("同期に時間がかかっています。しばらくお待ちください。");
    }
  };

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
            {isChecking
              ? "サブスクリプション情報を同期中です..."
              : syncError && !syncSuccess
                ? "同期に時間がかかっています。「再同期」ボタンを押すか、しばらくお待ちください。"
                : profile 
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
          <div className="space-y-3">
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
            {syncError && !syncSuccess && (
              <Button
                variant="outline"
                className="w-full glass-button h-12 rounded-xl gap-2"
                type="button"
                onClick={handleRetrySync}
                disabled={isRetrying}
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    同期中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    サブスクリプションを再同期
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
