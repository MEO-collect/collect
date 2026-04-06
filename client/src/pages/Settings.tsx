import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { 
  AlertTriangle,
  ArrowLeft, 
  Briefcase,
  Building2, 
  Calendar,
  CreditCard, 
  Loader2, 
  Mail, 
  Mic,
  RefreshCw,
  User 
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// 業種・書き起こしモデルの選択肢（サーバーコードと同期）
const INDUSTRY_OPTIONS = [
  { value: "medical", label: "医療・クリニック（内科・外科・歯科・皮膚科など）" },
  { value: "dental", label: "歯科クリニック" },
  { value: "welfare", label: "介護・福祉" },
  { value: "legal", label: "法律・会計・士業" },
  { value: "real_estate", label: "不動産" },
  { value: "construction", label: "建設・リフォーム" },
  { value: "retail", label: "小売・飲食・サービス" },
  { value: "it", label: "IT・テクノロジー" },
  { value: "education", label: "教育・研修" },
  { value: "other", label: "その他" },
] as const;

const TRANSCRIPTION_MODEL_OPTIONS = [
  { value: "elevenlabs_scribe_v2", label: "ElevenLabs Scribe v2（高精度・医療向け）" },
  { value: "gemini_2_5_flash", label: "Gemini 2.5 Flash（低コスト）" },
  { value: "gemini_3_flash", label: "Gemini 3 Flash（最新・低コスト）" },
] as const;

type IndustryValue = typeof INDUSTRY_OPTIONS[number]["value"];
type TranscriptionModelValue = typeof TRANSCRIPTION_MODEL_OPTIONS[number]["value"];

function getDefaultTranscriptionModel(industry: IndustryValue): TranscriptionModelValue {
  if (industry === "medical" || industry === "dental" || industry === "welfare") {
    return "elevenlabs_scribe_v2";
  }
  return "gemini_2_5_flash";
}
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

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "未設定";
  const date = new Date(timestamp);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Settings() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [industry, setIndustry] = useState<IndustryValue>("other");
  const [transcriptionModel, setTranscriptionModel] = useState<TranscriptionModelValue>("gemini_2_5_flash");
  const [modelManuallyChanged, setModelManuallyChanged] = useState(false);
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
      if (error.message?.includes("サブスクリプションが見つかりません")) {
        toast.error("サブスクリプション情報がまだ反映されていません。しばらくお待ちいただき、再度お試しください。");
      } else {
        toast.error(error.message || "解約に失敗しました");
      }
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

  const syncFromStripe = trpc.subscription.syncFromStripe.useMutation({
    onSuccess: (data) => {
      refetchSubscription();
      if (data.synced) {
        toast.success(data.message || "Stripeから同期しました");
      } else {
        toast.info(data.message || "同期する情報がありません");
      }
    },
    onError: (error) => {
      toast.error(error.message || "同期に失敗しました");
    },
  });

  useEffect(() => {
    if (profile) {
      setContactName(profile.contactName);
      setCompanyName(profile.companyName);
      setContactEmail(profile.contactEmail);
      setIndustry((profile.industry as IndustryValue) || "other");
      setTranscriptionModel((profile.transcriptionModel as TranscriptionModelValue) || "gemini_2_5_flash");
    }
  }, [profile]);

  const handleIndustryChange = (val: string) => {
    const newIndustry = val as IndustryValue;
    setIndustry(newIndustry);
    if (!modelManuallyChanged) {
      setTranscriptionModel(getDefaultTranscriptionModel(newIndustry));
    }
  };

  const handleTranscriptionModelChange = (val: string) => {
    setTranscriptionModel(val as TranscriptionModelValue);
    setModelManuallyChanged(true);
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertProfile.mutate({
      contactName,
      companyName,
      contactEmail,
      industry,
      transcriptionModel,
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
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/";
    return null;
  }

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div className="floating-orb w-72 h-72 bg-primary/15 top-[-5%] right-[-5%]" style={{ animationDelay: '0s' }} />
      <div className="floating-orb w-56 h-56 bg-blue-400/15 bottom-[10%] left-[-5%]" style={{ animationDelay: '2s' }} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-16 items-center">
          <Button 
            variant="ghost" 
            size="sm" 
            type="button"
            onClick={() => { window.location.href = "/home"; }}
            className="glass-button rounded-xl"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <span className="ml-4 font-semibold text-lg">設定</span>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="container py-8 max-w-2xl relative z-10">
        {/* プロフィール設定 */}
        <div className="glass-card p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 backdrop-blur-sm">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">会員情報</h2>
              <p className="text-sm text-muted-foreground">
                登録されている会員情報を確認・編集できます
              </p>
            </div>
          </div>
          
          <form onSubmit={handleProfileSubmit} className="space-y-5 mt-6">
            <div className="space-y-2">
              <Label htmlFor="contactName" className="text-sm font-medium">担当者名</Label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="contactName"
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
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="pl-11 glass-input h-12 rounded-xl"
                  required
                />
              </div>
            </div>

            {/* 業種選択 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">業種</Label>
              <div className="relative">
                <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Select value={industry} onValueChange={handleIndustryChange}>
                  <SelectTrigger className="pl-11 glass-input h-12 rounded-xl">
                    <SelectValue placeholder="業種を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 音声書き起こしモデル選択 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                音声書き起こしAI
              </Label>
              <p className="text-xs text-muted-foreground">
                業種に応じて自動設定されます。任意で変更可能です。
              </p>
              <div className="relative">
                <Mic className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Select value={transcriptionModel} onValueChange={handleTranscriptionModelChange}>
                  <SelectTrigger className="pl-11 glass-input h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSCRIPTION_MODEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(industry === "medical" || industry === "dental" || industry === "welfare") && transcriptionModel === "elevenlabs_scribe_v2" && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <span>✓</span> 医療・クリニック向けに最高精度の ElevenLabs Scribe v2 が設定されています
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              disabled={upsertProfile.isPending}
              className="btn-gradient text-white border-0 h-12 px-8 rounded-xl"
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
        </div>

        {/* サブスクリプション設定 */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 backdrop-blur-sm">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">サブスクリプション</h2>
              <p className="text-sm text-muted-foreground">
                現在のプランと契約状況を確認できます
              </p>
            </div>
          </div>

          {subscription ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-xl bg-white/30 backdrop-blur-sm">
                  <Label className="text-muted-foreground text-xs">プラン</Label>
                  <p className="font-semibold mt-1">{subscription.planName}</p>
                </div>
                <div className="p-4 rounded-xl bg-white/30 backdrop-blur-sm">
                  <Label className="text-muted-foreground text-xs">ステータス</Label>
                  <p className={`font-semibold mt-1 ${
                    subscription.status === "active" ? "text-emerald-600" : "text-amber-600"
                  }`}>
                    {subscription.status === "active" ? "有効" : subscription.status}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/30 backdrop-blur-sm">
                  <Label className="text-muted-foreground text-xs">月額料金</Label>
                  <p className="font-semibold mt-1">¥{subscription.monthlyPrice.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-xl bg-white/30 backdrop-blur-sm">
                  <Label className="text-muted-foreground text-xs">契約期間</Label>
                  <p className="font-semibold mt-1">
                    {subscription.isInInitialPeriod ? "初回契約期間中" : "通常契約"}
                  </p>
                </div>
              </div>

              {/* 契約日程情報 */}
              <div className="p-5 rounded-xl bg-white/40 backdrop-blur-sm border border-white/30">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="font-semibold">契約日程</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground text-xs">契約開始日</Label>
                    <p className="font-medium mt-1">{formatDate(subscription.startedAt)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">次回更新日</Label>
                    <p className="font-medium mt-1">{formatDate(subscription.currentPeriodEnd)}</p>
                  </div>
                  {subscription.isInInitialPeriod && (
                    <div className="sm:col-span-2">
                      <Label className="text-muted-foreground text-xs">初回契約期間終了日</Label>
                      <p className="font-medium mt-1">{formatDate(subscription.initialPeriodEndsAt)}</p>
                    </div>
                  )}
                  {subscription.canceledAt && (
                    <div className="sm:col-span-2">
                      <Label className="text-muted-foreground text-xs">解約申請日</Label>
                      <p className="font-medium mt-1 text-red-600">{formatDate(subscription.canceledAt)}</p>
                    </div>
                  )}
                </div>
              </div>

              {subscription.isInInitialPeriod && (
                <div className="p-5 rounded-xl bg-amber-50/80 backdrop-blur-sm border border-amber-200/50">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold text-amber-800 mb-1">初回契約期間中</p>
                      <p className="text-amber-700 leading-relaxed">
                        現在初回1年間の契約期間中です。この期間中に解約する場合、
                        解約金（¥{subscription.cancellationFee.toLocaleString()}）が発生します。
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 手動同期ボタン */}
              <div className="p-4 rounded-xl bg-white/30 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">サブスクリプション同期</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      決済済みなのに反映されない場合はこちらを押してください
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="glass-button rounded-xl gap-2"
                    onClick={() => syncFromStripe.mutate()}
                    disabled={syncFromStripe.isPending}
                  >
                    {syncFromStripe.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        同期中
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Stripeから同期
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/20">
                <Button 
                  type="button"
                  variant="destructive" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancelSubscription();
                  }}
                  disabled={cancelSubscription.isPending || subscription.status !== "active"}
                  className="rounded-xl h-12 px-6"
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
                {subscription.status !== "active" && (
                  <p className="text-sm text-muted-foreground mt-2">
                    サブスクリプションがアクティブでないため、解約できません。
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              サブスクリプション情報がありません
            </p>
          )}
        </div>
      </main>

      {/* 解約確認ダイアログ */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent className="glass-card border-0">
          <AlertDialogHeader>
            <AlertDialogTitle>解約の確認</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelConfirmation?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="glass-button rounded-xl">キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
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
