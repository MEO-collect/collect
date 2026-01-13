import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [isActivating, setIsActivating] = useState(true);
  const [activationError, setActivationError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  // URLからセッションIDを取得
  const sessionId = new URLSearchParams(search).get("session_id");

  // サブスクリプション状態を確認
  const { data: subscription, refetch: refetchSubscription } = trpc.subscription.get.useQuery(undefined, {
    refetchOnMount: 'always',
  });

  // プロファイル状態を確認
  const { data: profile, refetch: refetchProfile } = trpc.profile.get.useQuery(undefined, {
    refetchOnMount: 'always',
  });

  // セッションIDからサブスクリプションを有効化
  const activateMutation = trpc.subscription.activateFromSession.useMutation({
    onSuccess: async (data) => {
      console.log("Subscription activated successfully:", data);
      // サブスクリプション状態を再取得
      await refetchSubscription();
      await refetchProfile();
      setIsActivating(false);
    },
    onError: (error) => {
      console.error("Activation error:", error);
      setActivationError(error.message);
      setIsActivating(false);
    },
  });

  useEffect(() => {
    // セッションIDがある場合はサブスクリプションを有効化
    const activateSubscription = async () => {
      if (sessionId) {
        console.log("Activating subscription with session ID:", sessionId);
        activateMutation.mutate({ sessionId });
      } else {
        // セッションIDがない場合は既存のサブスクリプション状態を確認
        console.log("No session ID, checking existing subscription status");
        await refetchSubscription();
        await refetchProfile();
        setIsActivating(false);
      }
    };

    activateSubscription();
  }, [sessionId]);

  // サブスクリプションとプロファイルの状態に応じて自動遷移
  useEffect(() => {
    if (!isActivating && !activationError) {
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
  }, [isActivating, activationError, subscription, profile, setLocation]);

  const handleContinue = async () => {
    // キャッシュを無効化してサブスクリプション状態とプロファイルを再取得
    await utils.subscription.get.invalidate();
    await utils.profile.get.invalidate();
    
    // プロファイルがある場合はホームへ、ない場合は会員登録へ
    if (profile) {
      setLocation("/home");
    } else {
      setLocation("/register");
    }
  };

  const handleRetry = () => {
    if (sessionId) {
      setIsActivating(true);
      setActivationError(null);
      activateMutation.mutate({ sessionId });
    }
  };

  // エラー状態
  if (activationError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-10 w-10 text-red-600" />
            </div>
            <CardTitle className="text-2xl">エラーが発生しました</CardTitle>
            <CardDescription>
              {activationError}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              決済は完了していますが、サブスクリプションの有効化に問題が発生しました。
            </p>
            <div className="flex gap-2">
              <Button 
                className="flex-1"
                variant="outline"
                type="button"
                onClick={handleRetry}
              >
                再試行
              </Button>
              <Button 
                className="flex-1"
                type="button"
                onClick={handleContinue}
              >
                続行
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl">決済完了</CardTitle>
          <CardDescription>
            サブスクリプションの決済が完了しました
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            次に会員情報を登録して、AIアプリをご利用いただけるようになります。
          </p>
          
          {isActivating ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>サブスクリプションを有効化中...</span>
            </div>
          ) : (
            <Button 
              className="w-full"
              type="button"
              onClick={handleContinue}
            >
              {profile ? "ホームへ進む" : "会員情報を登録する"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
