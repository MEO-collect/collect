import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Hash,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { GeneratedContent, OutputFormat } from "@shared/bizwriter-types";
import { FORMAT_CHAR_LIMITS } from "@shared/bizwriter-types";

interface ResultViewProps {
  results: GeneratedContent[];
  onBack: () => void;
}

const FORMAT_THEME: Record<
  string,
  { gradient: string; badge: string; border: string }
> = {
  "Instagram投稿文": {
    gradient: "from-pink-500 to-purple-500",
    badge:
      "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
    border: "border-pink-200 dark:border-pink-800",
  },
  "公式LINE配信文": {
    gradient: "from-green-500 to-emerald-500",
    badge:
      "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
    border: "border-green-200 dark:border-green-800",
  },
  "SEOブログ記事": {
    gradient: "from-orange-500 to-amber-500",
    badge:
      "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
  },
  "GBP最新情報": {
    gradient: "from-blue-500 to-cyan-500",
    badge:
      "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
  },
};

function ResultCard({ item }: { item: GeneratedContent }) {
  const [copied, setCopied] = useState(false);
  const theme = FORMAT_THEME[item.format] || FORMAT_THEME["GBP最新情報"];
  const limit = FORMAT_CHAR_LIMITS[item.format as OutputFormat];
  const charCount = item.content.length;
  const isOverLimit = limit ? charCount > limit : false;

  const handleCopy = async () => {
    let text = item.content;
    if (item.hashtags.length > 0) {
      text += "\n\n" + item.hashtags.map((t) => `#${t}`).join(" ");
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("コピーしました");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`glass-card overflow-hidden border ${theme.border}`}>
      {/* ヘッダー */}
      <div
        className={`bg-gradient-to-r ${theme.gradient} px-5 py-3 flex items-center justify-between`}
      >
        <span className="text-white font-semibold text-sm">{item.format}</span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isOverLimit
                ? "bg-red-100 text-red-700"
                : "bg-white/20 text-white"
            }`}
          >
            {charCount}
            {limit ? ` / ${limit}` : ""} 文字
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 h-8 px-2"
            onClick={handleCopy}
          >
            {copied ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* 本文 */}
      <div className="p-5">
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {item.content}
        </div>

        {/* ハッシュタグ */}
        {item.hashtags.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <div className="flex items-center gap-1.5 mb-2">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                ハッシュタグ
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.hashtags.map((tag, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-1 rounded-md ${theme.badge}`}
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 警告 */}
        {item.warnings.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                注意事項
              </span>
            </div>
            <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
              {item.warnings.map((w, i) => (
                <li key={i}>・{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 改善提案 */}
        {item.suggestions.length > 0 && (
          <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                改善提案
              </span>
            </div>
            <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              {item.suggestions.map((s, i) => (
                <li key={i}>・{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultView({ results, onBack }: ResultViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="glass-button h-9 w-9 rounded-xl"
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">生成結果</h2>
          <p className="text-sm text-muted-foreground">
            {results.length}件の文章が生成されました
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {results.map((item, i) => (
          <ResultCard key={i} item={item} />
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full glass-button py-5"
        onClick={onBack}
      >
        新しいお題で生成する
      </Button>
    </div>
  );
}
