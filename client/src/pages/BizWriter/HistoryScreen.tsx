import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { HistoryEntry, GeneratedContent } from "@shared/bizwriter-types";

interface HistoryScreenProps {
  history: HistoryEntry[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onViewResult: (results: GeneratedContent[]) => void;
}

function HistoryItem({
  entry,
  onDelete,
  onViewResult,
}: {
  entry: HistoryEntry;
  onDelete: () => void;
  onViewResult: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const dateStr = new Date(entry.timestamp).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const formats = entry.results.map((r) => r.format);

  return (
    <div className="glass-card overflow-hidden">
      {/* ヘッダー */}
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{entry.topic}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{dateStr}</span>
            <div className="flex gap-1">
              {formats.map((f, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onViewResult();
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("この履歴を削除しますか？")) {
                onDelete();
                toast.success("履歴を削除しました");
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </button>

      {/* 展開時の内容 */}
      {expanded && (
        <div className="border-t border-border/30 px-4 py-3 space-y-3">
          {entry.results.map((result, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                {result.format}
              </p>
              <p className="text-sm whitespace-pre-wrap line-clamp-6">
                {result.content}
              </p>
              {result.hashtags.length > 0 && (
                <p className="text-xs text-primary">
                  {result.hashtags.map((t) => `#${t}`).join(" ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HistoryScreen({
  history,
  onDelete,
  onClear,
  onViewResult,
}: HistoryScreenProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold mb-1">生成履歴</h2>
          <p className="text-sm text-muted-foreground">
            {history.length > 0
              ? `${history.length}件の履歴`
              : "まだ履歴がありません"}
          </p>
        </div>
        {history.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive glass-button"
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            全削除
          </Button>
        )}
      </div>

      {/* 全削除確認 */}
      {showClearConfirm && (
        <div className="glass-card p-4 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                すべての履歴を削除しますか？
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                この操作は元に戻せません。
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    onClear();
                    setShowClearConfirm(false);
                    toast.success("すべての履歴を削除しました");
                  }}
                >
                  削除する
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowClearConfirm(false)}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 履歴リスト */}
      {history.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-muted-foreground text-sm">
            文章を生成すると、ここに履歴が表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => (
            <HistoryItem
              key={entry.id}
              entry={entry}
              onDelete={() => onDelete(entry.id)}
              onViewResult={() => onViewResult(entry.results)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
