import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const utils = trpc.useUtils();

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
          
          {isChecking ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>登録状態を確認中...</span>
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
