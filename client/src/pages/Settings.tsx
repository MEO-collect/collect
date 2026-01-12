import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { 
  AlertTriangle,
  ArrowLeft, 
  Building2, 
  CreditCard, 
  Loader2, 
  Mail, 
  User 
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Settings() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelConfirmation, setCancelConfirmation] = useState<{
    requiresConfirmation: boolean;
    cancellationFee: number;
    message: string;
  } | null>(null);

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = trpc.subscription.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const upsertProfile = trpc.profile.upsert.useMutation({
    onSuccess: () => {
      toast.success("会員情報を更新しました");
    },
    onError: (error) => {
      toast.error(error.message || "更新に失敗しました");
    },
  });

  const cancelSubscription = trpc.subscription.cancel.useMutation({
    onSuccess: (data) => {
      if (data.requiresConfirmation) {
        setCancelConfirmation(data);
        setShowCancelDialog(true);
      } else {
        toast.success(data.message);
        refetchSubscription();
      }
    },
    onError: (error) => {
      toast.error(error.message || "解約に失敗しました");
    },
  });

  const confirmCancel = trpc.subscription.confirmCancel.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setShowCancelDialog(false);
      setCancelConfirmation(null);
      refetchSubscription();
    },
    onError: (error) => {
      toast.error(error.message || "解約に失敗しました");
    },
  });

  useEffect(() => {
    if (profile) {
      setContactName(profile.contactName);
      setCompanyName(profile.companyName);
      setContactEmail(profile.contactEmail);
    }
  }, [profile]);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertProfile.mutate({
      contactName,
      companyName,
      contactEmail,
    });
  };

  const handleCancelSubscription = () => {
    cancelSubscription.mutate();
  };

  const handleConfirmCancel = () => {
    confirmCancel.mutate({ acceptCancellationFee: true });
  };

  if (authLoading || profileLoading || subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/home")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <span className="ml-4 font-semibold">設定</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 max-w-2xl">
        {/* Profile Settings */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">会員情報</CardTitle>
            <CardDescription>
              登録されている会員情報を確認・編集できます
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contactName">担当者名</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="contactName"
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
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={upsertProfile.isPending}
              >
                {upsertProfile.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    更新中...
                  </>
                ) : (
                  "変更を保存"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Subscription Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              サブスクリプション
            </CardTitle>
            <CardDescription>
              現在のプランと契約状況を確認できます
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground text-xs">プラン</Label>
                    <p className="font-medium">{subscription.planName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">ステータス</Label>
                    <p className={`font-medium ${
                      subscription.status === "active" ? "text-green-600" : "text-amber-600"
                    }`}>
                      {subscription.status === "active" ? "有効" : subscription.status}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">月額料金</Label>
                    <p className="font-medium">¥{subscription.monthlyPrice.toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">契約期間</Label>
                    <p className="font-medium">
                      {subscription.isInInitialPeriod ? "初回契約期間中" : "通常契約"}
                    </p>
                  </div>
                </div>

                {subscription.isInInitialPeriod && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium mb-1">初回契約期間中</p>
                        <p className="text-amber-700">
                          現在初回1年間の契約期間中です。この期間中に解約する場合、
                          解約金（¥{subscription.cancellationFee.toLocaleString()}）が発生します。
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <Button 
                    variant="destructive" 
                    onClick={handleCancelSubscription}
                    disabled={cancelSubscription.isPending || subscription.status !== "active"}
                  >
                    {cancelSubscription.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        処理中...
                      </>
                    ) : (
                      "サブスクリプションを解約"
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                サブスクリプション情報がありません
              </p>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解約の確認</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelConfirmation?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmCancel.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  処理中...
                </>
              ) : (
                "解約を確定"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
