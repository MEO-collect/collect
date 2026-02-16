import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertTriangle, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { UserProfile, AnalysisResult, DiagnosisResult, TokenUsage } from "@shared/shozai-types";
import { DIAGNOSIS_STATUS_MESSAGES } from "@shared/shozai-types";

interface DiagnosisStepProps {
  analysis: AnalysisResult;
  profile: UserProfile;
  onDiagnosisComplete: (result: DiagnosisResult, tokens: TokenUsage) => void;
  onBack: () => void;
}

export function DiagnosisStep({ analysis, profile, onDiagnosisComplete, onBack }: DiagnosisStepProps) {
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [statusMsg, setStatusMsg] = useState(DIAGNOSIS_STATUS_MESSAGES[0]);
  const [hasStarted, setHasStarted] = useState(false);
  const statusIdx = useRef(0);
  const diagnoseMutation = trpc.shozai.diagnose.useMutation();

  useEffect(() => {
    if (!isDiagnosing) return;
    const interval = setInterval(() => {
      statusIdx.current = (statusIdx.current + 1) % DIAGNOSIS_STATUS_MESSAGES.length;
      setStatusMsg(DIAGNOSIS_STATUS_MESSAGES[statusIdx.current]);
    }, 3000);
    return () => clearInterval(interval);
  }, [isDiagnosing]);

  const startDiagnosis = useCallback(async () => {
    setIsDiagnosing(true);
    statusIdx.current = 0;
    setStatusMsg(DIAGNOSIS_STATUS_MESSAGES[0]);

    try {
      const result = await diagnoseMutation.mutateAsync({
        analysis: {
          serviceSummary: analysis.serviceSummary,
          pricingAndContract: analysis.pricingAndContract,
          contractPeriod: analysis.contractPeriod,
          optionsAndBenefits: analysis.optionsAndBenefits,
          salesTactics: analysis.salesTactics,
          concerns: analysis.concerns,
        },
        profile: {
          industry: profile.industry,
          address: profile.address,
          url: profile.url,
        },
      });
      onDiagnosisComplete(result.diagnosis, result.tokenUsage);
      toast.success("診断が完了しました");
    } catch (err) {
      toast.error(
        `診断に失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`
      );
      setIsDiagnosing(false);
    }
  }, [analysis, profile, diagnoseMutation, onDiagnosisComplete]);

  // Auto-start
  useEffect(() => {
    if (!hasStarted) {
      setHasStarted(true);
      startDiagnosis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isDiagnosing) {
    return (
      <Card className="border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
        <CardContent className="py-16 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-teal-100 dark:from-indigo-900/50 dark:to-teal-900/50 flex items-center justify-center">
              <Stethoscope className="h-10 w-10 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            </div>
            <div className="absolute -inset-2 rounded-full border-2 border-indigo-300/30 dark:border-indigo-600/30 animate-pulse" />
            <div className="absolute -inset-4 rounded-full border border-teal-200/20 dark:border-teal-700/20 animate-ping" style={{ animationDuration: "3s" }} />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
              ドクターが診断中
            </p>
            <p className="text-sm text-indigo-600 dark:text-indigo-400 animate-pulse">
              {statusMsg}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-teal-500 rounded-full animate-[loading_2.5s_ease-in-out_infinite]" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error / retry
  return (
    <Card className="border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
      <CardContent className="py-12 flex flex-col items-center gap-4">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <p className="text-sm text-slate-600 dark:text-slate-400">診断を完了できませんでした</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <Button onClick={startDiagnosis}>再試行</Button>
        </div>
      </CardContent>
    </Card>
  );
}
