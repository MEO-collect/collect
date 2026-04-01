import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

/** JST時刻に変換して表示 */
function formatJST(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

/** エラーメッセージのカテゴリを判定 */
function getErrorCategory(msg: string): { label: string; color: string } {
  if (msg.includes("SERVICE_UNAVAILABLE") || msg.includes("Service Unavailable") || msg.includes("503")) {
    return { label: "503 サービス停止", color: "bg-orange-100 text-orange-700" };
  }
  if (msg.includes("PRECONDITION_FAILED") || msg.includes("412 Precondition Failed")) {
    return { label: "412 利用制限", color: "bg-yellow-100 text-yellow-700" };
  }
  if (msg.includes("RATE_LIMITED") || msg.includes("429")) {
    return { label: "429 レート制限", color: "bg-amber-100 text-amber-700" };
  }
  if (msg.includes("not valid JSON") || msg.includes("LLM response")) {
    return { label: "JSONパースエラー", color: "bg-red-100 text-red-700" };
  }
  if (msg.includes("LLM invoke failed")) {
    return { label: "LLMエラー", color: "bg-red-100 text-red-700" };
  }
  return { label: "その他", color: "bg-slate-100 text-slate-700" };
}

export default function AdminErrorReports() {
  const { loading: authLoading, isAuthenticated, user } = useAuth();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: reports, isLoading, refetch } = trpc.report.list.useQuery(
    { limit: 200 },
    { enabled: !!user && user.role === "admin" }
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/";
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">アクセス権限がありません</h2>
          <p className="text-muted-foreground mb-4">このページは管理者のみアクセスできます。</p>
          <Button onClick={() => { window.location.href = "/home"; }}>ホームに戻る</Button>
        </div>
      </div>
    );
  }

  // エラーカテゴリ別の集計
  const categoryCounts = (reports || []).reduce<Record<string, number>>((acc, r) => {
    const cat = getErrorCategory(r.errorMessage).label;
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      <div className="floating-orb w-72 h-72 bg-primary/15 top-[-5%] right-[-5%]" style={{ animationDelay: "0s" }} />
      <div className="floating-orb w-56 h-56 bg-blue-400/15 bottom-[10%] left-[-5%]" style={{ animationDelay: "2s" }} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-16 items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { window.location.href = "/home"; }}
            className="glass-button rounded-xl"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <span className="font-semibold text-lg">エラー報告一覧（管理者）</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="ml-auto glass-button rounded-xl"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            更新
          </Button>
        </div>
      </header>

      <main className="container py-8 relative z-10">
        {/* サマリー */}
        <div className="glass-card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">エラーサマリー（全{reports?.length ?? 0}件）</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(categoryCounts).map(([cat, count]) => {
              const { color } = getErrorCategory(cat);
              return (
                <div key={cat} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${color}`}>
                  <AlertTriangle className="h-4 w-4" />
                  {cat}: <span className="font-bold">{count}件</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
            <strong>主なエラー原因：</strong>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong>503 サービス停止</strong> — AIサービスが一時的に混雑。しばらく待てば自然に解消します。</li>
              <li><strong>412 利用制限</strong> — APIのレート制限またはプラン制限。時間をおいて再試行が必要です。</li>
              <li><strong>JSONパースエラー</strong> — AIサービスがHTMLエラーページを返した。503と同じ原因が多いです。</li>
            </ul>
          </div>
        </div>

        {/* エラー一覧 */}
        <div className="space-y-3">
          {(reports || []).map((r) => {
            const cat = getErrorCategory(r.errorMessage);
            const isExpanded = expandedId === r.id;
            return (
              <div key={r.id} className="glass-card p-4">
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.color}`}>{cat.label}</span>
                      <Badge variant="outline" className="text-xs">{r.appName}</Badge>
                      <Badge variant="outline" className="text-xs">{r.operation}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{formatJST(r.createdAt)} (JST)</span>
                    </div>
                    <p className="text-sm font-medium truncate">{r.errorMessage}</p>
                    {r.userName && (
                      <p className="text-xs text-muted-foreground mt-0.5">ユーザー: {r.userName} ({r.userEmail})</p>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground">エラーメッセージ：</span>
                      <pre className="mt-1 p-2 bg-muted/50 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all">
                        {r.errorMessage}
                      </pre>
                    </div>
                    {r.context && (
                      <div>
                        <span className="font-medium text-muted-foreground">コンテキスト：</span>
                        <pre className="mt-1 p-2 bg-muted/50 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all">
                          {(() => {
                            try { return JSON.stringify(JSON.parse(r.context!), null, 2); }
                            catch { return r.context; }
                          })()}
                        </pre>
                      </div>
                    )}
                    {r.userComment && (
                      <div>
                        <span className="font-medium text-muted-foreground">ユーザーコメント：</span>
                        <p className="mt-1 p-2 bg-muted/50 rounded-lg text-xs">{r.userComment}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {reports?.length === 0 && (
            <div className="glass-card text-center py-12">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">エラー報告はありません</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
