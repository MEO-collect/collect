import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Building2, Loader2, Mail, User, UserPlus } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

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
    refetchOnMount: 'always',
  });

  const utils = trpc.useUtils();

  const upsertProfile = trpc.profile.upsert.useMutation({
    onSuccess: async () => {
      toast.success("会員情報を登録しました");
      await utils.profile.get.invalidate();
      await utils.subscription.get.invalidate();
      window.location.href = "/home";
    },
    onError: (error) => {
      toast.error(error.message || "登録に失敗しました");
    },
  });

  useEffect(() => {
    if (profile) {
      setContactName(profile.contactName);
      setCompanyName(profile.companyName);
      setContactEmail(profile.contactEmail);
    } else if (user?.email) {
      setContactEmail(user.email);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/";
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && !subscriptionLoading) {
      if (!subscription || subscription.status !== "active") {
        window.location.href = "/subscription";
        return;
      }
      
      if (!profileLoading && profile) {
        window.location.href = "/home";
      }
    }
  }, [authLoading, profileLoading, subscriptionLoading, profile, subscription, isAuthenticated]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertProfile.mutate({
      contactName,
      companyName,
      contactEmail,
    });
  };

  if (authLoading || subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!subscription || subscription.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center gradient-mesh p-4 relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div className="floating-orb w-72 h-72 bg-primary/20 top-[-5%] left-[-10%]" style={{ animationDelay: '0s' }} />
      <div className="floating-orb w-56 h-56 bg-blue-400/20 bottom-[-5%] right-[-5%]" style={{ animationDelay: '2s' }} />
      <div className="floating-orb w-40 h-40 bg-purple-400/15 top-[40%] right-[10%]" style={{ animationDelay: '4s' }} />

      <div className="glass-card w-full max-w-md p-8 relative z-10">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">会員情報登録</h1>
          <p className="text-muted-foreground">
            サービスをご利用いただくために、以下の情報をご登録ください
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="contactName" className="text-sm font-medium">担当者名</Label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="contactName"
                placeholder="山田 太郎"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="pl-11 glass-input h-12 rounded-xl"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName" className="text-sm font-medium">会社名 / 店舗名</Label>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="companyName"
                placeholder="株式会社サンプル"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="pl-11 glass-input h-12 rounded-xl"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail" className="text-sm font-medium">メールアドレス</Label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="contactEmail"
                type="email"
                placeholder="example@company.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="pl-11 glass-input h-12 rounded-xl"
                required
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full btn-gradient text-white border-0 h-14 text-lg rounded-xl mt-8"
            disabled={upsertProfile.isPending}
          >
            {upsertProfile.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                登録中...
              </>
            ) : (
              "登録して次へ"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
