/**
 * Stripe Product and Price Configuration
 * 
 * BtoB AIプラットフォーム サブスクリプションプラン
 * - 月額課金（テスト段階では0円）
 * - 初回1年間は解約制限あり（解約金：残り月数×月額）
 */

export const SUBSCRIPTION_PLAN = {
  name: "BtoB AIプラットフォーム プレミアムプラン",
  description: "5つのAIアプリを無制限に利用可能",
  // テスト段階では0円（本番では適切な価格に変更）
  priceInYen: 0,
  interval: "month" as const,
  // 初回契約期間（月数）
  initialPeriodMonths: 12,
};

/**
 * 解約金を計算
 * @param startedAt サブスクリプション開始日（Unix timestamp in ms）
 * @param monthlyPrice 月額料金（円）
 * @returns 解約金（円）
 */
export function calculateCancellationFee(
  startedAt: number,
  monthlyPrice: number
): number {
  const now = Date.now();
  const msPerMonth = 30 * 24 * 60 * 60 * 1000;
  const monthsElapsed = Math.floor((now - startedAt) / msPerMonth);
  const remainingMonths = Math.max(0, SUBSCRIPTION_PLAN.initialPeriodMonths - monthsElapsed);
  return remainingMonths * monthlyPrice;
}

/**
 * 初回期間内かどうかを判定
 * @param startedAt サブスクリプション開始日（Unix timestamp in ms）
 * @returns 初回期間内ならtrue
 */
export function isInInitialPeriod(startedAt: number): boolean {
  const now = Date.now();
  const msPerMonth = 30 * 24 * 60 * 60 * 1000;
  const initialPeriodMs = SUBSCRIPTION_PLAN.initialPeriodMonths * msPerMonth;
  return now < startedAt + initialPeriodMs;
}
