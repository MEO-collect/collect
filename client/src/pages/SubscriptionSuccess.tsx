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
  const { data: subscription, refetch } = trpc.subscription.get.useQuery(undefined, {
    refetchOnMount: 'always',
  });

  useEffect(() => {
    // ページ表示時にサブスクリプション状態を再取得
    const checkSubscription = async () => {
      console.log("Checking subscription status after payment...");
      
      // 少し待ってからサブスクリプション状態を確認
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // サブスクリプション状態を再取得
      await refetch();
      
      setIsChecking(false);
    };

    checkSubscription();
  }, [refetch]);

  const handleGoHome = async () => {
    // キャッシュを無効化してサブスクリプション状態を再取得
    await utils.subscription.get.invalidate();
    
    // ホームページに遷移
    setLocation("/home");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl">登録完了</CardTitle>
          <CardDescription>
            サブスクリプションの登録が完了しました
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            AIアプリをご利用いただけるようになりました。
            ホーム画面からアプリをお選びください。
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
              onClick={handleGoHome}
            >
              ホームへ進む
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
