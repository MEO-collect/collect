import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  ShieldAlert,
  ClipboardList,
  Scale,
  TrendingUp,
  Coins,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import type { AnalysisResult, DiagnosisResult, TokenUsage, Verdict } from "@shared/shozai-types";

interface ReportStepProps {
  diagnosis: DiagnosisResult;
  analysis: AnalysisResult;
  analysisTokens: TokenUsage;
  diagnosisTokens: TokenUsage;
  onRestart: () => void;
}

const VERDICT_CONFIG: Record<Verdict, { color: string; bg: string; border: string; icon: typeof CheckCircle2; label: string }> = {
  "おすすめ": {
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40",
    border: "border-emerald-300 dark:border-emerald-700",
    icon: CheckCircle2,
    label: "おすすめ",
  },
  "要検討": {
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40",
    border: "border-amber-300 dark:border-amber-700",
    icon: AlertTriangle,
    label: "要検討",
  },
  "おすすめしない": {
    color: "text-red-700 dark:text-red-300",
    bg: "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/40",
    border: "border-red-300 dark:border-red-700",
    icon: XCircle,
    label: "おすすめしない",
  },
};

export function ReportStep({
  diagnosis,
  analysis,
  analysisTokens,
  diagnosisTokens,
  onRestart,
}: ReportStepProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const verdictCfg = VERDICT_CONFIG[diagnosis.verdict] || VERDICT_CONFIG["要検討"];
  const VerdictIcon = verdictCfg.icon;

  const totalPromptTokens = analysisTokens.promptTokens + diagnosisTokens.promptTokens;
  const totalCompletionTokens = analysisTokens.completionTokens + diagnosisTokens.completionTokens;
  const totalCost = Math.round((analysisTokens.estimatedCostYen + diagnosisTokens.estimatedCostYen) * 100) / 100;

  const handleDownload = async () => {
    if (!reportRef.current) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `商材ドクター_診断結果_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("レポート画像をダウンロードしました");
    } catch {
      toast.error("画像の生成に失敗しました");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Report Card (capturable) */}
      <div ref={reportRef} className="space-y-4">
        {/* Verdict Hero */}
        <Card className={`border-2 ${verdictCfg.border} ${verdictCfg.bg} shadow-xl overflow-hidden`}>
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <div className="relative">
              <VerdictIcon className={`h-16 w-16 ${verdictCfg.color}`} />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                総合判定
              </p>
              <h2 className={`text-3xl font-black ${verdictCfg.color}`}>
                {verdictCfg.label}
              </h2>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 text-center leading-relaxed max-w-sm">
              {diagnosis.verdictReason}
            </p>
          </CardContent>
        </Card>

        {/* Validity Check */}
        <Card className="border-0 shadow-lg bg-white/90 dark:bg-slate-800/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                <Scale className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
              </div>
              妥当性チェック
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {diagnosis.validityCheck}
            </p>
          </CardContent>
        </Card>

        {/* Market Comparison */}
        <Card className="border-0 shadow-lg bg-white/90 dark:bg-slate-800/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              相場比較
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {diagnosis.marketComparison}
            </p>
          </CardContent>
        </Card>

        {/* Merits & Demerits */}
        <div className="grid grid-cols-1 gap-4">
          <Card className="border-0 shadow-lg bg-white/90 dark:bg-slate-800/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <ThumbsUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                メリット
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {diagnosis.merits.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/90 dark:bg-slate-800/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-red-700 dark:text-red-300">
                <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                  <ThumbsDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                </div>
                デメリット
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {diagnosis.demerits.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Overcharge Warnings */}
        {diagnosis.overchargeWarnings.length > 0 && (
          <Card className="border-2 border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <div className="w-7 h-7 rounded-lg bg-amber-200 dark:bg-amber-900/60 flex items-center justify-center">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                過剰請求・無駄な項目の警告
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {diagnosis.overchargeWarnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Pre-contract Notes */}
        <Card className="border-0 shadow-lg bg-white/90 dark:bg-slate-800/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <ClipboardList className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              契約前の注意点
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {diagnosis.preContractNotes.map((n, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                    {i + 1}
                  </span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Token Cost */}
        <div className="p-4 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              API使用量・コスト概算
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">入力トークン</p>
              <p className="text-sm font-mono font-semibold text-slate-700 dark:text-slate-300">
                {totalPromptTokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">出力トークン</p>
              <p className="text-sm font-mono font-semibold text-slate-700 dark:text-slate-300">
                {totalCompletionTokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">推定コスト</p>
              <p className="text-sm font-mono font-semibold text-teal-600 dark:text-teal-400">
                ¥{totalCost.toFixed(2)}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">
            ※ Gemini 2.5 Flash の概算価格に基づく参考値です
          </p>
        </div>
      </div>

      {/* Actions (outside capture area) */}
      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex-1 h-12 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          画像保存
        </Button>
        <Button
          onClick={onRestart}
          className="flex-1 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 text-white shadow-lg shadow-teal-500/20 h-12 text-base font-semibold"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          新しい診断
        </Button>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center leading-relaxed px-4">
        ※ 本診断はAIによる参考情報であり、法的助言や専門家の意見に代わるものではありません。
        重要な契約判断の際は、必ず専門家にご相談ください。
      </p>
    </div>
  );
}
