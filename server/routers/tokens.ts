/**
 * Token Router
 * トークン残高照会・購入・履歴取得のtRPCプロシージャ
 *
 * 設計:
 * - monthlyBalance: 月額支給トークン（毎月50,000T、繰り越し不可・月末リセット）
 * - bonusBalance: 追加購入トークン（繰り越し可・有料トークン）
 * - 消費順序: monthlyBalance → bonusBalance
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { TOKEN_PURCHASE_PLANS, TOKEN_COSTS, MONTHLY_TOKEN_GRANT } from "../../drizzle/schema";
import {
  getOrCreateTokenBalance,
  grantMonthlyTokens,
  getTokenHistory,
} from "../tokenManager";
import Stripe from "stripe";
import { ENV } from "../_core/env";

const stripe = new Stripe(ENV.stripeSecretKey!, { apiVersion: "2025-12-15.clover" });

export const tokensRouter = router({
  /**
   * トークン残高を取得
   */
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const balance = await getOrCreateTokenBalance(ctx.user.id);
    return {
      monthlyBalance: balance.monthlyBalance,
      bonusBalance: balance.bonusBalance,
      totalBalance: balance.monthlyBalance + balance.bonusBalance,
      nextResetAt: balance.nextResetAt,
      lastGrantedAt: balance.lastGrantedAt,
    };
  }),

  /**
   * 月次トークン支給（サブスク更新時やログイン時に呼ぶ）
   * 月額トークンは繰り越し不可（毎月リセット）
   * 追加購入トークンは繰り越し可
   */
  grantMonthly: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await grantMonthlyTokens(ctx.user.id);
    return {
      granted: result.granted,
      monthlyBalance: result.balance.monthlyBalance,
      bonusBalance: result.balance.bonusBalance,
      totalBalance: result.balance.monthlyBalance + result.balance.bonusBalance,
    };
  }),

  /**
   * 購入プラン一覧を取得
   */
  getPurchasePlans: protectedProcedure.query(() => {
    return TOKEN_PURCHASE_PLANS.map((plan) => ({
      ...plan,
      // 月額レートとの比較用: 月額¥19,800 / 50,000T = 0.396円/T
      unitPriceJpy: (plan.priceJpy / plan.tokens).toFixed(3),
      baseUnitPriceJpy: "0.396",
    }));
  }),

  /**
   * トークン購入のStripe Checkoutセッションを作成
   */
  createPurchaseCheckout: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const plan = TOKEN_PURCHASE_PLANS.find((p) => p.id === input.planId);
      if (!plan) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "無効なプランIDです" });
      }

      const origin = (ctx.req.headers.origin as string) || "https://btobaiapp-2yeo54ck.manus.space";

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "jpy",
              product_data: {
                name: `追加トークン ${plan.tokens.toLocaleString()}T`,
                description: `BtoB AIプラットフォーム 追加トークン（繰り越し可能・有料トークン）${plan.discountRate > 0 ? ` ${plan.discountRate}%割引` : ""}`,
              },
              unit_amount: plan.priceJpy,
            },
            quantity: 1,
          },
        ],
        customer_email: ctx.user.email ?? undefined,
        client_reference_id: ctx.user.id.toString(),
        metadata: {
          user_id: ctx.user.id.toString(),
          plan_id: plan.id,
          tokens: plan.tokens.toString(),
          customer_email: ctx.user.email ?? "",
          customer_name: ctx.user.name ?? "",
          purchase_type: "token_addon",
        },
        allow_promotion_codes: true,
        success_url: `${origin}/tokens?purchase=success&plan=${plan.id}`,
        cancel_url: `${origin}/tokens?purchase=canceled`,
      });

      return { checkoutUrl: session.url };
    }),

  /**
   * トークン消費履歴を取得
   */
  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const history = await getTokenHistory(ctx.user.id, input.limit);
      return history.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        appName: tx.appName,
        feature: tx.feature,
        metadata: tx.metadata ? JSON.parse(tx.metadata) : null,
        balanceAfterMonthly: tx.balanceAfterMonthly,
        balanceAfterBonus: tx.balanceAfterBonus,
        createdAt: tx.createdAt,
      }));
    }),

  /**
   * トークンコスト定義を取得（フロントエンド表示用）
   */
  getCostDefinitions: protectedProcedure.query(() => {
    return {
      costs: TOKEN_COSTS,
      monthlyGrant: MONTHLY_TOKEN_GRANT,
    };
  }),
});
