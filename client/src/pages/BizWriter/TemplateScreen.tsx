import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import type { Templates, OutputFormat } from "@shared/bizwriter-types";
import { OUTPUT_FORMATS } from "@shared/bizwriter-types";

interface TemplateScreenProps {
  templates: Templates;
  onUpdate: (templates: Templates) => void;
}

const FORMAT_TABS: { format: OutputFormat; label: string; color: string }[] = [
  {
    format: "Instagram投稿文",
    label: "Instagram",
    color: "border-pink-400 bg-pink-50 text-pink-700 dark:bg-pink-950/30 dark:text-pink-300",
  },
  {
    format: "公式LINE配信文",
    label: "LINE",
    color: "border-green-400 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300",
  },
  {
    format: "SEOブログ記事",
    label: "ブログ",
    color: "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
  },
  {
    format: "GBP最新情報",
    label: "GBP",
    color: "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
  },
];

export default function TemplateScreen({
  templates,
  onUpdate,
}: TemplateScreenProps) {
  const [activeFormat, setActiveFormat] = useState<OutputFormat>(
    OUTPUT_FORMATS[0]
  );

  const handleChange = (
    format: OutputFormat,
    field: "opening" | "closing",
    value: string
  ) => {
    onUpdate({
      ...templates,
      [format]: {
        ...templates[format],
        [field]: value,
      },
    });
  };

  const current = templates[activeFormat] || { opening: "", closing: "" };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">定型文テンプレート</h2>
        <p className="text-sm text-muted-foreground">
          媒体ごとに冒頭・締めの定型文を登録できます。生成時に自動適用されます。
        </p>
      </div>

      {/* 媒体タブ */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FORMAT_TABS.map((tab) => (
          <button
            key={tab.format}
            onClick={() => setActiveFormat(tab.format)}
            className={`shrink-0 rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all ${
              activeFormat === tab.format
                ? tab.color + " border-current"
                : "border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* テンプレート編集 */}
      <div className="glass-card p-5 space-y-5">
        <div className="space-y-2">
          <Label className="font-semibold">冒頭の定型文</Label>
          <Textarea
            placeholder={`例：いつも${activeFormat === "公式LINE配信文" ? "ご愛読" : "ご覧"}いただきありがとうございます。`}
            value={current.opening}
            onChange={(e) =>
              handleChange(activeFormat, "opening", e.target.value)
            }
            rows={4}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            生成される文章の先頭に挿入されます
          </p>
        </div>

        <div className="space-y-2">
          <Label className="font-semibold">締めの定型文</Label>
          <Textarea
            placeholder="例：お気軽にお問い合わせください。"
            value={current.closing}
            onChange={(e) =>
              handleChange(activeFormat, "closing", e.target.value)
            }
            rows={4}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            生成される文章の末尾に挿入されます
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          <span>変更は自動保存されます</span>
        </div>
      </div>

      {/* プレビュー */}
      {(current.opening || current.closing) && (
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-3 text-sm">プレビュー</h3>
          <div className="rounded-lg bg-muted/30 p-4 text-sm space-y-2">
            {current.opening && (
              <p className="text-primary font-medium">{current.opening}</p>
            )}
            <p className="text-muted-foreground italic">
              （ここにAI生成文が入ります）
            </p>
            {current.closing && (
              <p className="text-primary font-medium">{current.closing}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
