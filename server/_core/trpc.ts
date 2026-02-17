import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { eq } from "drizzle-orm";
import { subscriptions } from "../../drizzle/schema";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * Procedure that requires both authentication AND an active subscription.
 * Use this for all AI app endpoints that should be gated behind a paid plan.
 */
const requireActiveSubscription = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Check subscription status in database
  try {
    const { drizzle } = await import("drizzle-orm/mysql2");
    const db = process.env.DATABASE_URL ? drizzle(process.env.DATABASE_URL) : null;
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "データベースに接続できません",
      });
    }

    const result = await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.user.id)).limit(1);
    const subscription = result.length > 0 ? result[0] : null;

    if (!subscription || subscription.status !== "active") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "この機能を利用するにはアクティブなサブスクリプションが必要です。設定画面からサブスクリプションの状態をご確認ください。",
      });
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    console.error("[SubscriptionCheck] Error:", err);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "サブスクリプションの確認中にエラーが発生しました",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const subscribedProcedure = t.procedure.use(requireActiveSubscription);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
