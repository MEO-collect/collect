import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  History,
  Loader2,
  Plus,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  Zap,
  Gem,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// トークン数から各機能の利用可能量を計算
function calcUsage(tokens: number) {
  return {
    scribeMinutes: Math.floor(tokens / 6),       // ElevenLabs: 6T/分
    geminiMinutes: Math.floor(tokens / 2),       // Gemini: 2T/分
    imageEdits: Math.floor(tokens / 6),          // 画像加工: 6T/回
    summaries: Math.floor(tokens / 5),           // 要約: 5T/回
    shozai: Math.floor(tokens / 12),             // 商材ドクター: 12T/回
  };
}

const APP_LABEL: Record<string, string> = {
  voice: "音声書き起こし",
  bizwriter: "AI文章作成",
  shozai: "商材ドクター",
  image: "AI画像加工",
};

const FEATURE_LABEL: Record<string, string> = {
  transcribe: "書き起こし",
  transcribeChunk: "書き起こし（チャンク）",
  summarize: "要約",
  generateMinutes: "議事録生成",
  generateKarte: "カルテ生成",
  generate: "文章生成",
  analyze: "資料分析",
  diagnose: "AI診断",
  editPhoto: "写真編集",
  magicEraser: "マジック消しゴム",
};

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  grant_monthly: { label: "月次支給", color: "text-emerald-600" },
  purchase: { label: "追加購入", color: "text-blue-600" },
  consume: { label: "消費", color: "text-rose-600" },
};

function formatDate(ts: number | Date | null) {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts) : ts;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TokensPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // URLパラメータで購入結果を確認
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get("purchase");
    if (purchase === "success") {
      toast.success("トークンの購入が完了しました！残高に反映されます。");
      window.history.replaceState({}, "", "/tokens");
    } else if (purchase === "canceled") {
      toast.info("購入がキャンセルされました。");
      window.history.replaceState({}, "", "/tokens");
    }
  }, []);

  const { data: balance, isLoading: balanceLoading, refetch: refetchBalance } = trpc.tokens.getBalance.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: plans, isLoading: plansLoading } = trpc.tokens.getPurchasePlans.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: history, isLoading: historyLoading } = trpc.tokens.getHistory.useQuery(
    { limit: 50 },
    { enabled: isAuthenticated }
  );

  const { data: costDefs } = trpc.tokens.getCostDefinitions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // 月次トークン支給チェック
  const grantMonthly = trpc.tokens.grantMonthly.useMutation({
    onSuccess: (data) => {
      if (data.granted) {
        toast.success(`今月のトークン ${data.monthlyBalance.toLocaleString()}T が支給されました！`);
        refetchBalance();
      }
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
      grantMonthly.mutate();
    }
  }, [isAuthenticated]);

  const createCheckout = trpc.tokens.createPurchaseCheckout.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        toast.info("決済ページに移動します...");
        window.open(data.checkoutUrl, "_blank");
      }
    },
    onError: (err) => {
      toast.error(err.message || "エラーが発生しました");
    },
  });

  if (authLoading || balanceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalBalance = (balance?.monthlyBalance ?? 0) + (balance?.bonusBalance ?? 0);
  const monthlyPct = totalBalance > 0 ? Math.round(((balance?.monthlyBalance ?? 0) / totalBalance) * 100) : 0;

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      <div className="floating-orb w-80 h-80 bg-primary/15 top-[-5%] right-[-5%]" style={{ animationDelay: "0s" }} />
      <div className="floating-orb w-64 h-64 bg-blue-400/15 bottom-[5%] left-[-5%]" style={{ animationDelay: "3s" }} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-16 items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/home")}
            className="glass-button h-10 w-10 rounded-xl"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Gem className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold text-lg">トークン管理</span>
          </div>
        </div>
      </header>

      <main className="container py-8 relative z-10 space-y-8">
        {/* 残高カード */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 合計残高 */}
          <Card className="glass-card md:col-span-1 border-primary/20">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Gem className="h-4 w-4 text-primary" />
                合計残高
              </CardDescription>
              <CardTitle className="text-4xl font-bold text-primary">
                {totalBalance.toLocaleString()}
                <span className="text-lg font-normal text-muted-foreground ml-1">T</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">月額トークン（今月）</span>
                <span className="font-medium text-emerald-600">{(balance?.monthlyBalance ?? 0).toLocaleString()}T</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">追加購入トークン（繰越可）</span>
                <span className="font-medium text-blue-600">{(balance?.bonusBalance ?? 0).toLocaleString()}T</span>
              </div>
              <Separator />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>月額トークンは毎月リセット（繰越不可）</p>
                <p>追加購入トークンは翌月以降も繰越可能</p>
                {balance?.nextResetAt && (
                  <p className="text-amber-600">次回リセット: {formatDate(balance.nextResetAt)}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* トークン消費レート */}
          <Card className="glass-card md:col-span-2">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                各機能のトークン消費レート
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="space-y-1.5">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">音声書き起こし</p>
                  <div className="flex justify-between">
                    <span>ElevenLabs Scribe v2</span>
                    <Badge variant="outline" className="text-rose-600 border-rose-200">6T / 分</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Gemini 2.5/3 Flash</span>
                    <Badge variant="outline" className="text-emerald-600 border-emerald-200">2T / 分</Badge>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">テキスト生成</p>
                  <div className="flex justify-between">
                    <span>要約生成</span>
                    <Badge variant="outline">5T / 回</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>議事録・カルテ生成</span>
                    <Badge variant="outline">8T / 回</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>AI文章作成</span>
                    <Badge variant="outline">6T / 回</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>商材ドクター（分析・診断）</span>
                    <Badge variant="outline">12T / 回</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>AI画像加工</span>
                    <Badge variant="outline">6T / 回</Badge>
                  </div>
                </div>
              </div>
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground">
                月額¥19,800で毎月{(costDefs?.monthlyGrant ?? 50000).toLocaleString()}T支給。
                消費順序: 月額トークン → 追加購入トークン
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 追加購入プラン */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            追加トークン購入
          </h2>
          {plansLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {plans?.map((plan) => (
                <Card
                  key={plan.id}
                  className={`glass-card relative cursor-pointer hover-lift transition-all ${
                    plan.discountRate > 0 ? "border-primary/40" : ""
                  }`}
                >
                  {plan.discountRate > 0 && (
                    <div className="absolute -top-2 -right-2 z-10">
                      <Badge className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5">
                        {plan.discountRate}% OFF
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-base">{plan.label}</CardTitle>
                    <CardDescription className="text-lg font-bold text-foreground">
                      {plan.tokens.toLocaleString()}
                      <span className="text-sm font-normal text-muted-foreground">T</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {/* 利用換算表示 */}
                    {(() => {
                      const u = calcUsage(plan.tokens);
                      return (
                        <div className="space-y-1 py-1 border-t border-border/50">
                          <p className="text-xs font-medium text-muted-foreground">このトークンでできること</p>
                          <ul className="text-xs text-foreground space-y-0.5">
                            <li>🎤 書き起こし <span className="font-bold text-primary">{u.scribeMinutes}分</span><span className="text-muted-foreground">（Scribe）</span></li>
                            <li>🎤 書き起こし <span className="font-bold text-emerald-600">{u.geminiMinutes}分</span><span className="text-muted-foreground">（Gemini）</span></li>
                            <li>🖼️ 画像加工 <span className="font-bold text-primary">{u.imageEdits}枚</span></li>
                            <li>📝 要約生成 <span className="font-bold text-primary">{u.summaries}回</span></li>
                            <li>🔬 商材ドクター <span className="font-bold text-primary">{u.shozai}回</span></li>
                          </ul>
                        </div>
                      );
                    })()}
                    <p className="text-xs text-muted-foreground">
                      {Number(plan.unitPriceJpy).toFixed(3)}円/T
                    </p>
                    <Button
                      size="sm"
                      className="w-full btn-gradient text-white border-0 text-xs"
                      onClick={() => createCheckout.mutate({ planId: plan.id })}
                      disabled={createCheckout.isPending}
                    >
                      {createCheckout.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-1" />
                          購入
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            ※ 追加購入トークンは月をまたいで繰り越し可能です。
          </p>
        </div>

        {/* 消費履歴 */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            利用履歴
          </h2>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !history || history.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p>まだ利用履歴がありません</p>
                <p className="text-sm mt-1">AIアプリを使うと履歴が表示されます</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">日時</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">種別</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">アプリ / 機能</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">消費/付与</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">残高（月額）</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">残高（追加）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((tx, i) => {
                      const typeInfo = TYPE_LABEL[tx.type] ?? { label: tx.type, color: "text-foreground" };
                      const isConsume = tx.type === "consume";
                      return (
                        <tr key={tx.id} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(tx.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {tx.appName ? (
                              <span>
                                {APP_LABEL[tx.appName] ?? tx.appName}
                                {tx.feature && (
                                  <span className="text-xs ml-1 opacity-70">
                                    / {FEATURE_LABEL[tx.feature] ?? tx.feature}
                                  </span>
                                )}
                                {tx.metadata?.durationMinutes && (
                                  <span className="text-xs ml-1 opacity-70">
                                    ({Number(tx.metadata.durationMinutes).toFixed(1)}分)
                                  </span>
                                )}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-medium ${isConsume ? "text-rose-600" : "text-emerald-600"}`}>
                            {isConsume ? "" : "+"}{tx.amount.toLocaleString()}T
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            {tx.balanceAfterMonthly?.toLocaleString() ?? "—"}T
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            {tx.balanceAfterBonus?.toLocaleString() ?? "—"}T
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
