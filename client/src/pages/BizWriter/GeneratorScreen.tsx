import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type {
  StoreProfile,
  Templates,
  HistoryEntry,
  OutputFormat,
  Tone,
  GeneratedContent,
  TargetLengthOption,
} from "@shared/bizwriter-types";
import {
  OUTPUT_FORMATS,
  TONES,
  FORMAT_CHAR_LIMITS,
  TARGET_LENGTH_OPTIONS,
} from "@shared/bizwriter-types";

interface GeneratorScreenProps {
  profile: StoreProfile;
  templates: Templates;
  history: HistoryEntry[];
  onGenerated: (topic: string, results: GeneratedContent[]) => void;
}

const FORMAT_COLORS: Record<OutputFormat, string> = {
  "Instagram投稿文": "bg-gradient-to-r from-pink-500 to-purple-500",
  "公式LINE配信文": "bg-gradient-to-r from-green-500 to-emerald-500",
  "SEOブログ記事": "bg-gradient-to-r from-orange-500 to-amber-500",
  "GBP最新情報": "bg-gradient-to-r from-blue-500 to-cyan-500",
};

const FORMAT_COLORS_LIGHT: Record<OutputFormat, string> = {
  "Instagram投稿文":
    "border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-950/30 dark:text-pink-300",
  "公式LINE配信文":
    "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-300",
  "SEOブログ記事":
    "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
  "GBP最新情報":
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
};

export default function GeneratorScreen({
  profile,
  templates,
  history,
  onGenerated,
}: GeneratorScreenProps) {
  const [topic, setTopic] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<OutputFormat[]>([
    "Instagram投稿文",
  ]);
  const [tone, setTone] = useState<Tone>(profile.preferredTone || "丁寧");
  const [targetLength, setTargetLength] = useState<TargetLengthOption>("推奨");
  const [customLength, setCustomLength] = useState<number>(500);
  const [useTemplates, setUseTemplates] = useState(false);
  const [checkConsistency, setCheckConsistency] = useState(false);
  const [useOnlySiteInfo, setUseOnlySiteInfo] = useState(false);

  const generateMutation = trpc.bizwriter.generate.useMutation();

  const hasUrls = !!(profile.websiteUrl || profile.referenceUrl);

  const toggleFormat = (format: OutputFormat) => {
    setSelectedFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format]
    );
  };

  // 文字数バリデーション
  const charLimitWarnings = useMemo(() => {
    if (targetLength !== "カスタム") return [];
    return selectedFormats
      .filter((f) => customLength > FORMAT_CHAR_LIMITS[f])
      .map(
        (f) =>
          `${f}の上限は${FORMAT_CHAR_LIMITS[f]}文字ですが、${customLength}文字が指定されています`
      );
  }, [targetLength, customLength, selectedFormats]);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("お題を入力してください");
      return;
    }
    if (selectedFormats.length === 0) {
      toast.error("出力形式を1つ以上選択してください");
      return;
    }

    // 文字数超過の確認
    if (charLimitWarnings.length > 0) {
      const confirmed = window.confirm(
        `以下の媒体で文字数上限を超えています。AIが上限に合わせて調整しますがよろしいですか？\n\n${charLimitWarnings.join(
          "\n"
        )}`
      );
      if (!confirmed) return;
    }

    // 過去の投稿を参照用に取得
    const historyTexts = checkConsistency
      ? history
          .slice(0, 3)
          .map((h) => h.results.map((r) => r.content).join("\n"))
      : [];

    try {
      const result = await generateMutation.mutateAsync({
        profile,
        topic: topic.trim(),
        formats: selectedFormats,
        tone,
        targetLength,
        customLength: targetLength === "カスタム" ? customLength : undefined,
        useOnlySiteInfo,
        templates: useTemplates ? templates : null,
        useTemplates,
        history: historyTexts,
      });
      onGenerated(topic.trim(), result.results);
      toast.success("文章を生成しました");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "生成に失敗しました";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">コンテンツ生成</h2>
        <p className="text-sm text-muted-foreground">
          お題を入力して、SNS・ブログ・MEO用の文章を自動生成
        </p>
      </div>

      {/* お題入力 */}
      <div className="glass-card p-5 space-y-3">
        <Label className="text-base font-semibold">今回のお題</Label>
        <Textarea
          placeholder="例：春の花粉症対策キャンペーンについて投稿したい"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>

      {/* 出力形式 */}
      <div className="glass-card p-5 space-y-3">
        <Label className="text-base font-semibold">出力形式</Label>
        <div className="grid grid-cols-2 gap-2">
          {OUTPUT_FORMATS.map((format) => {
            const selected = selectedFormats.includes(format);
            return (
              <button
                key={format}
                onClick={() => toggleFormat(format)}
                className={`relative rounded-xl border-2 p-3 text-left text-sm font-medium transition-all active:scale-95 ${
                  selected
                    ? FORMAT_COLORS_LIGHT[format] + " border-current"
                    : "border-border/50 bg-background/50 text-muted-foreground hover:border-border"
                }`}
              >
                {selected && (
                  <div
                    className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${FORMAT_COLORS[format]}`}
                  />
                )}
                {format}
              </button>
            );
          })}
        </div>
      </div>

      {/* トーン & 文字数 */}
      <div className="glass-card p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* トーン */}
          <div className="space-y-2">
            <Label>トーン</Label>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                    tone === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 文字数の目安 */}
          <div className="space-y-2">
            <Label>文字数の目安</Label>
            <div className="flex flex-wrap gap-2">
              {TARGET_LENGTH_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTargetLength(opt)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                    targetLength === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {targetLength === "カスタム" && (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  min={50}
                  max={10000}
                  value={customLength}
                  onChange={(e) =>
                    setCustomLength(Math.max(50, parseInt(e.target.value) || 50))
                  }
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">文字</span>
              </div>
            )}
          </div>
        </div>

        {/* 文字数超過の警告 */}
        {charLimitWarnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
              {charLimitWarnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* オプション */}
      <div className="glass-card p-5 space-y-4">
        <Label className="text-base font-semibold">オプション</Label>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">テンプレート適用</p>
              <p className="text-xs text-muted-foreground">
                登録した定型文（冒頭・締め）を適用
              </p>
            </div>
            <Switch checked={useTemplates} onCheckedChange={setUseTemplates} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">過去の投稿と一貫性を保つ</p>
              <p className="text-xs text-muted-foreground">
                直近の投稿を参照してトーンを揃える
              </p>
            </div>
            <Switch
              checked={checkConsistency}
              onCheckedChange={setCheckConsistency}
            />
          </div>

          {hasUrls && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">サイト情報のみを使用する</p>
                <p className="text-xs text-muted-foreground">
                  登録URLの情報のみで生成（ハルシネーション防止）
                </p>
              </div>
              <Switch
                checked={useOnlySiteInfo}
                onCheckedChange={setUseOnlySiteInfo}
              />
            </div>
          )}
        </div>
      </div>

      {/* 生成ボタン */}
      <Button
        className="w-full btn-gradient text-white border-0 py-6 text-base font-semibold gap-2"
        onClick={handleGenerate}
        disabled={generateMutation.isPending || !topic.trim() || selectedFormats.length === 0}
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            生成中...
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" />
            文章を生成する
          </>
        )}
      </Button>
    </div>
  );
}
