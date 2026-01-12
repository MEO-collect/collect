import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Building2, Loader2, Mail, User } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

export default function Register() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: subscription, isLoading: subscriptionLoading } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const upsertProfile = trpc.profile.upsert.useMutation({
    onSuccess: () => {
      toast.success("会員情報を登録しました");
      // プロファイル登録後、サブスクリプション確認へ
      if (subscription?.status === "active") {
        setLocation("/home");
      } else {
        setLocation("/subscription");
      }
    },
    onError: (error) => {
      toast.error(error.message || "登録に失敗しました");
    },
  });

  // 既存プロファイルがあれば入力欄にセット
  useEffect(() => {
    if (profile) {
      setContactName(profile.contactName);
      setCompanyName(profile.companyName);
      setContactEmail(profile.contactEmail);
    } else if (user?.email) {
      setContactEmail(user.email);
    }
  }, [profile, user]);

  // 既にプロファイルとアクティブなサブスクリプションがある場合はホームへ
  useEffect(() => {
    if (!authLoading && !profileLoading && !subscriptionLoading) {
      if (profile && subscription?.status === "active") {
        setLocation("/home");
      }
    }
  }, [authLoading, profileLoading, subscriptionLoading, profile, subscription, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertProfile.mutate({
      contactName,
      companyName,
      contactEmail,
    });
  };

  if (authLoading || profileLoading || subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">BtoB AIプラットフォーム</CardTitle>
            <CardDescription>
              サービスをご利用いただくにはログインが必要です
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              onClick={() => window.location.href = getLoginUrl()}
            >
              ログイン
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">会員情報登録</CardTitle>
          <CardDescription>
            サービスをご利用いただくために、以下の情報をご登録ください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">担当者名</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="contactName"
                  placeholder="山田 太郎"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">会社名 / 店舗名</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="companyName"
                  placeholder="株式会社サンプル"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactEmail">メールアドレス</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="contactEmail"
                  type="email"
                  placeholder="example@company.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full mt-6"
              disabled={upsertProfile.isPending}
            >
              {upsertProfile.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  登録中...
                </>
              ) : (
                "登録して次へ"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
