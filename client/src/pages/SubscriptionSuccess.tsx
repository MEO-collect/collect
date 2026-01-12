import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();

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
          <Button 
            className="w-full"
            onClick={() => setLocation("/home")}
          >
            ホームへ進む
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
