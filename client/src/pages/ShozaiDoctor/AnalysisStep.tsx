import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Search,
  ArrowLeft,
  ArrowRight,
  FileSearch,
  DollarSign,
  Clock,
  Gift,
  Megaphone,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { UserProfile, AnalysisResult, TokenUsage, UploadedFile } from "@shared/shozai-types";
import { ANALYSIS_STATUS_MESSAGES } from "@shared/shozai-types";

interface AnalysisStepProps {
  files: UploadedFile[];
  profile: UserProfile;
  analysisResult: AnalysisResult | null;
  onAnalysisComplete: (result: AnalysisResult, tokens: TokenUsage) => void;
  onProceed: () => void;
  onBack: () => void;
}

const SECTION_CONFIG = [
  { key: "serviceSummary" as const, label: "サービス概要", icon: FileSearch, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-100 dark:bg-teal-900/40" },
  { key: "pricingAndContract" as const, label: "料金体系と契約内容", icon: DollarSign, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-900/40" },
  { key: "contractPeriod" as const, label: "契約期間", icon: Clock, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/40" },
  { key: "optionsAndBenefits" as const, label: "オプション・特典", icon: Gift, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
  { key: "salesTactics" as const, label: "営業トークの特徴", icon: Megaphone, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40" },
  { key: "concerns" as const, label: "懸念点", icon: AlertTriangle, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40" },
];

export function AnalysisStep({
  files,
  profile,
  analysisResult,
  onAnalysisComplete,
  onProceed,
  onBack,
}: AnalysisStepProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState(ANALYSIS_STATUS_MESSAGES[0]);
  const statusIdx = useRef(0);
  const analyzeMutation = trpc.shozai.analyze.useMutation();

  // Cycle through status messages during analysis
  useEffect(() => {
    if (!isAnalyzing) return;
    const interval = setInterval(() => {
      statusIdx.current = (statusIdx.current + 1) % ANALYSIS_STATUS_MESSAGES.length;
      setStatusMsg(ANALYSIS_STATUS_MESSAGES[statusIdx.current]);
    }, 3000);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const startAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    statusIdx.current = 0;
    setStatusMsg(ANALYSIS_STATUS_MESSAGES[0]);

    try {
      const result = await analyzeMutation.mutateAsync({
        files: files.map((f) => ({
          name: f.name,
          type: f.type,
          base64: f.base64,
        })),
        profile: {
          industry: profile.industry,
          address: profile.address,
          url: profile.url,
        },
      });
      onAnalysisComplete(result.analysis, result.tokenUsage);
      toast.success("資料の分析が完了しました");
    } catch (err) {
      toast.error(
        `分析に失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [files, profile, analyzeMutation, onAnalysisComplete]);

  // Auto-start analysis if no result yet
  useEffect(() => {
    if (!analysisResult && !isAnalyzing && files.length > 0) {
      startAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loading state
  if (isAnalyzing) {
    return (
      <Card className="border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
        <CardContent className="py-16 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-teal-100 to-indigo-100 dark:from-teal-900/50 dark:to-indigo-900/50 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-teal-600 dark:text-teal-400 animate-spin" />
            </div>
            <div className="absolute -inset-2 rounded-full border-2 border-teal-300/30 dark:border-teal-600/30 animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
              AI分析中
            </p>
            <p className="text-sm text-teal-600 dark:text-teal-400 animate-pulse">
              {statusMsg}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-teal-500 to-indigo-500 rounded-full animate-[loading_2s_ease-in-out_infinite]" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Result review
  if (analysisResult) {
    return (
      <Card className="border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Search className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-900 dark:text-white">分析結果レビュー</CardTitle>
              <CardDescription className="text-xs">
                AIが読み取った内容をご確認ください
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {SECTION_CONFIG.map(({ key, label, icon: Icon, color, bg }) => (
            <div
              key={key}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600/50"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                </div>
                <h3 className={`text-sm font-semibold ${color}`}>{label}</h3>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {analysisResult[key]}
              </p>
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onBack}
              className="flex-1 h-12 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Button>
            <Button
              onClick={onProceed}
              className="flex-1 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 text-white shadow-lg shadow-teal-500/20 h-12 text-base font-semibold"
            >
              診断へ進む
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error / retry state
  return (
    <Card className="border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
      <CardContent className="py-12 flex flex-col items-center gap-4">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <p className="text-sm text-slate-600 dark:text-slate-400">分析を開始できませんでした</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <Button onClick={startAnalysis}>再試行</Button>
        </div>
      </CardContent>
    </Card>
  );
}
