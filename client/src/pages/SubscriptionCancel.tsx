import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function SubscriptionCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <XCircle className="h-10 w-10 text-amber-600" />
          </div>
          <CardTitle className="text-2xl">登録がキャンセルされました</CardTitle>
          <CardDescription>
            サブスクリプションの登録がキャンセルされました
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            ご不明な点がございましたら、お気軽にお問い合わせください。
          </p>
          <div className="flex flex-col gap-2">
            <Button 
              className="w-full"
              onClick={() => setLocation("/subscription")}
            >
              もう一度試す
            </Button>
            <Button 
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/")}
            >
              トップページへ戻る
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
