/**
 * Token Manager
 * 独自トークン方式の中核ロジック
 * - 月次支給（毎月50,000T、繰り越し不可）
 * - トークン消費（月額分 → ボーナス分の順に消費）
 * - 残高照会
 * - 購入後の付与
 */

import { getDb } from "./db";
import { tokenBalances, tokenTransactions, MONTHLY_TOKEN_GRANT, TOKEN_COSTS, type TokenCostKey } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// ─── 残高照会 ─────────────────────────────────────────────

/**
 * ユーザーのトークン残高を取得（なければ初期化）
 */
export async function getOrCreateTokenBalance(userId: number) {
  const d = await getDb();
  if (!d) throw new Error("Database not available");

  const existing = await d
    .select()
    .from(tokenBalances)
    .where(eq(tokenBalances.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // 初回: レコード作成（残高0）
  await d.insert(tokenBalances).values({
    userId,
    monthlyBalance: 0,
    bonusBalance: 0,
    lastGrantedAt: null,
    nextResetAt: null,
  });

  const created = await d
    .select()
    .from(tokenBalances)
    .where(eq(tokenBalances.userId, userId))
    .limit(1);

  return created[0];
}

/**
 * トークン合計残高を返す（月額 + ボーナス）
 */
export async function getTotalBalance(userId: number): Promise<number> {
  const balance = await getOrCreateTokenBalance(userId);
  return balance.monthlyBalance + balance.bonusBalance;
}

// ─── 月次支給 ─────────────────────────────────────────────

/**
 * 月次トークン支給
 * - 月額残高を50,000Tにリセット（繰り越し不可）
 * - ボーナス残高は維持
 * - 同月内に2回呼ばれても1回のみ実行
 */
export async function grantMonthlyTokens(userId: number): Promise<{ granted: boolean; balance: typeof tokenBalances.$inferSelect }> {
  const d = await getDb();
  if (!d) throw new Error("Database not available");

  const balance = await getOrCreateTokenBalance(userId);
  const now = Date.now();

  // 今月すでに支給済みかチェック
  if (balance.lastGrantedAt) {
    const lastGrantDate = new Date(balance.lastGrantedAt);
    const nowDate = new Date(now);
    if (
      lastGrantDate.getFullYear() === nowDate.getFullYear() &&
      lastGrantDate.getMonth() === nowDate.getMonth()
    ) {
      return { granted: false, balance };
    }
  }

  // 翌月1日 00:00:00 を次回リセット日として計算
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);

  // 月額残高をリセットして50,000T付与
  await d
    .update(tokenBalances)
    .set({
      monthlyBalance: MONTHLY_TOKEN_GRANT,
      lastGrantedAt: now,
      nextResetAt: nextMonth.getTime(),
    })
    .where(eq(tokenBalances.userId, userId));

  // 更新後の残高を取得
  const updatedBalance = await getOrCreateTokenBalance(userId);

  // 履歴記録
  await d.insert(tokenTransactions).values({
    userId,
    type: "grant_monthly",
    amount: MONTHLY_TOKEN_GRANT,
    appName: null,
    feature: null,
    metadata: JSON.stringify({ month: new Date(now).toISOString().slice(0, 7) }),
    balanceAfterMonthly: updatedBalance.monthlyBalance,
    balanceAfterBonus: updatedBalance.bonusBalance,
  });

  return { granted: true, balance: updatedBalance };
}

// ─── トークン消費 ─────────────────────────────────────────

export interface ConsumeTokensOptions {
  userId: number;
  /** TOKEN_COSTSのキー（固定消費の場合） */
  costKey?: TokenCostKey;
  /** 直接指定する消費量（分数など可変の場合） */
  amount?: number;
  appName: string;
  feature: string;
  metadata?: Record<string, unknown>;
}

export interface ConsumeTokensResult {
  success: boolean;
  consumed: number;
  remainingMonthly: number;
  remainingBonus: number;
  /** 残高不足の場合のメッセージ */
  errorMessage?: string;
}

/**
 * トークンを消費する
 * 消費順序: 月額残高 → ボーナス残高
 */
export async function consumeTokens(options: ConsumeTokensOptions): Promise<ConsumeTokensResult> {
  const d = await getDb();
  if (!d) throw new Error("Database not available");

  const { userId, costKey, amount, appName, feature, metadata } = options;

  // 消費量を決定
  const toConsume = amount ?? (costKey ? TOKEN_COSTS[costKey] : 0);
  if (toConsume <= 0) {
    throw new Error("consumeTokens: amount must be > 0");
  }

  const balance = await getOrCreateTokenBalance(userId);
  const totalAvailable = balance.monthlyBalance + balance.bonusBalance;

  if (totalAvailable < toConsume) {
    return {
      success: false,
      consumed: 0,
      remainingMonthly: balance.monthlyBalance,
      remainingBonus: balance.bonusBalance,
      errorMessage: `トークンが不足しています。必要: ${toConsume}T、残高: ${totalAvailable}T`,
    };
  }

  // 月額残高から先に消費
  let newMonthly = balance.monthlyBalance;
  let newBonus = balance.bonusBalance;
  let remaining = toConsume;

  if (newMonthly >= remaining) {
    newMonthly -= remaining;
    remaining = 0;
  } else {
    remaining -= newMonthly;
    newMonthly = 0;
    newBonus -= remaining;
  }

  // DB更新
  await d
    .update(tokenBalances)
    .set({ monthlyBalance: newMonthly, bonusBalance: newBonus })
    .where(eq(tokenBalances.userId, userId));

  // 履歴記録
  await d.insert(tokenTransactions).values({
    userId,
    type: "consume",
    amount: -toConsume,
    appName,
    feature,
    metadata: metadata ? JSON.stringify(metadata) : null,
    balanceAfterMonthly: newMonthly,
    balanceAfterBonus: newBonus,
  });

  return {
    success: true,
    consumed: toConsume,
    remainingMonthly: newMonthly,
    remainingBonus: newBonus,
  };
}

// ─── 購入付与 ─────────────────────────────────────────────

/**
 * 購入トークンをボーナス残高に付与
 */
export async function addPurchasedTokens(
  userId: number,
  tokens: number,
  stripePaymentIntentId: string,
  planId: string,
): Promise<void> {
  const d = await getDb();
  if (!d) throw new Error("Database not available");

  const balance = await getOrCreateTokenBalance(userId);
  const newBonus = balance.bonusBalance + tokens;

  await d
    .update(tokenBalances)
    .set({ bonusBalance: newBonus })
    .where(eq(tokenBalances.userId, userId));

  await d.insert(tokenTransactions).values({
    userId,
    type: "purchase",
    amount: tokens,
    appName: null,
    feature: null,
    metadata: JSON.stringify({ planId }),
    stripePaymentIntentId,
    balanceAfterMonthly: balance.monthlyBalance,
    balanceAfterBonus: newBonus,
  });
}

// ─── 履歴照会 ─────────────────────────────────────────────

/**
 * トークン消費履歴を取得（最新50件）
 */
export async function getTokenHistory(userId: number, limit = 50) {
  const d = await getDb();
  if (!d) throw new Error("Database not available");

  return d
    .select()
    .from(tokenTransactions)
    .where(eq(tokenTransactions.userId, userId))
    .orderBy(desc(tokenTransactions.createdAt))
    .limit(limit);
}
