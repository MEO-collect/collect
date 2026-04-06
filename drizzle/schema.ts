import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 業種カテゴリ
 * medical: 医療・クリニック系 → ElevenLabs Scribe v2がデフォルト
 * other: その他 → Gemini 2.5 Flashがデフォルト
 */
export const INDUSTRY_OPTIONS = [
  { value: "medical", label: "医療・クリニック（内科・外科・歯科・皮膚科など）" },
  { value: "dental", label: "歯科クリニック" },
  { value: "welfare", label: "介護・福祉" },
  { value: "legal", label: "法律・会計・士業" },
  { value: "real_estate", label: "不動産" },
  { value: "construction", label: "建設・リフォーム" },
  { value: "retail", label: "小売・飲食・サービス" },
  { value: "it", label: "IT・テクノロジー" },
  { value: "education", label: "教育・研修" },
  { value: "other", label: "その他" },
] as const;

export type IndustryValue = typeof INDUSTRY_OPTIONS[number]["value"];

/**
 * 書き起こしモデル
 * elevenlabs_scribe_v2: ElevenLabs Scribe v2（日本語最高精度・話者分離対応）
 * gemini_2_5_flash: Gemini 2.5 Flash（低コスト）
 * gemini_3_flash: Gemini 3 Flash（最新・低コスト）
 */
export const TRANSCRIPTION_MODEL_OPTIONS = [
  { value: "elevenlabs_scribe_v2", label: "ElevenLabs Scribe v2（高精度・医療向け）" },
  { value: "gemini_2_5_flash", label: "Gemini 2.5 Flash（低コスト）" },
  { value: "gemini_3_flash", label: "Gemini 3 Flash（最新・低コスト）" },
] as const;

export type TranscriptionModelValue = typeof TRANSCRIPTION_MODEL_OPTIONS[number]["value"];

/** 業種に応じたデフォルト書き起こしモデルを返す */
export function getDefaultTranscriptionModel(industry: IndustryValue): TranscriptionModelValue {
  if (industry === "medical" || industry === "dental" || industry === "welfare") {
    return "elevenlabs_scribe_v2";
  }
  return "gemini_2_5_flash";
}

/**
 * Member profile table for BtoB users
 * Stores business-specific information
 */
export const memberProfiles = mysqlTable("member_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** 担当者名 */
  contactName: varchar("contactName", { length: 255 }).notNull(),
  /** 会社名または店舗名 */
  companyName: varchar("companyName", { length: 255 }).notNull(),
  /** メールアドレス */
  contactEmail: varchar("contactEmail", { length: 320 }).notNull(),
  /** 業種カテゴリ */
  industry: varchar("industry", { length: 50 }).default("other").notNull(),
  /** 書き起こしモデル（業種に応じて自動設定、ユーザーが変更可能） */
  transcriptionModel: varchar("transcriptionModel", { length: 50 }).default("gemini_2_5_flash").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MemberProfile = typeof memberProfiles.$inferSelect;
export type InsertMemberProfile = typeof memberProfiles.$inferInsert;

/**
 * Subscription table for managing Stripe subscriptions
 * Only stores essential Stripe IDs - fetch details from Stripe API
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** Stripe Customer ID */
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  /** Stripe Subscription ID */
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  /** Subscription status: active, canceled, past_due, etc. */
  status: mysqlEnum("status", ["active", "canceled", "past_due", "trialing", "incomplete", "incomplete_expired", "unpaid"]).default("incomplete").notNull(),
  /** Subscription start date (Unix timestamp in milliseconds) */
  startedAt: bigint("startedAt", { mode: "number" }),
  /** Initial period end date - 1 year from start (Unix timestamp in milliseconds) */
  initialPeriodEndsAt: bigint("initialPeriodEndsAt", { mode: "number" }),
  /** Whether user is in initial 1-year period (cannot cancel without penalty) */
  isInInitialPeriod: boolean("isInInitialPeriod").default(true).notNull(),
  /** Current period end date (Unix timestamp in milliseconds) */
  currentPeriodEnd: bigint("currentPeriodEnd", { mode: "number" }),
  /** Canceled at timestamp (Unix timestamp in milliseconds) */
  canceledAt: bigint("canceledAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Generated contents table for BizWriter
 * Stores history of AI-generated content to avoid repetition
 */
export const generatedContents = mysqlTable("generated_contents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Store profile JSON (for matching similar generation requests) */
  storeProfileHash: varchar("storeProfileHash", { length: 64 }).notNull(),
  /** Output format (Instagram投稿文, 公式LINE配信文, etc.) */
  format: varchar("format", { length: 100 }).notNull(),
  /** Topic/theme used for generation */
  topic: varchar("topic", { length: 500 }),
  /** Generated text content */
  generatedText: text("generatedText").notNull(),
  /** Character count */
  charCount: int("charCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GeneratedContent = typeof generatedContents.$inferSelect;
export type InsertGeneratedContent = typeof generatedContents.$inferInsert;

/**
 * Error reports table
 * Stores user-submitted error reports from the app
 */
export const errorReports = mysqlTable("error_reports", {
  id: int("id").autoincrement().primaryKey(),
  /** User ID (nullable for unauthenticated errors) */
  userId: int("userId"),
  /** App name where the error occurred (e.g. "voice", "bizwriter", "image") */
  appName: varchar("appName", { length: 100 }).notNull(),
  /** Operation that failed (e.g. "transcribe", "summarize") */
  operation: varchar("operation", { length: 100 }).notNull(),
  /** Error message from the exception */
  errorMessage: text("errorMessage").notNull(),
  /** Additional context (JSON string: file size, duration, speaker count, etc.) */
  context: text("context"),
  /** Optional comment from the user */
  userComment: text("userComment"),
  /** Browser user agent */
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ErrorReport = typeof errorReports.$inferSelect;
export type InsertErrorReport = typeof errorReports.$inferInsert;

/**
 * Token balances table
 * 月額サブスクで毎月50,000T支給、繰り越し不可
 */
export const tokenBalances = mysqlTable("token_balances", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** 月額トークン残高（毎月50,000T支給、繰り越し不可） */
  monthlyBalance: int("monthlyBalance").default(0).notNull(),
  /** 追加購入トークン残高（繰り越し可） */
  bonusBalance: int("bonusBalance").default(0).notNull(),
  /** 最終月次支給日（Unixタイムスタンプ・ミリ秒） */
  lastGrantedAt: bigint("lastGrantedAt", { mode: "number" }),
  /** 次回月次リセット日（Unixタイムスタンプ・ミリ秒） */
  nextResetAt: bigint("nextResetAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TokenBalance = typeof tokenBalances.$inferSelect;
export type InsertTokenBalance = typeof tokenBalances.$inferInsert;

/**
 * Token transactions table
 * トークンの消費・支給・購入履歴
 */
export const tokenTransactions = mysqlTable("token_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** トランザクション種別 */
  type: mysqlEnum("type", ["grant_monthly", "consume", "purchase", "expire"]).notNull(),
  /** トークン変動量（消費は負値、支給・購入は正値） */
  amount: int("amount").notNull(),
  /** 消費元アプリ名（例: voice, bizwriter, image, shozai） */
  appName: varchar("appName", { length: 100 }),
  /** 消費元機能名（例: transcribe_elevenlabs, summarize, generate_minutes） */
  feature: varchar("feature", { length: 100 }),
  /** 消費メタデータ（JSON文字列: 分数・回数等） */
  metadata: text("metadata"),
  /** Stripe Payment Intent ID（購入時） */
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  /** 変動後の月額トークン残高 */
  balanceAfterMonthly: int("balanceAfterMonthly"),
  /** 変動後のボーナストークン残高 */
  balanceAfterBonus: int("balanceAfterBonus"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TokenTransaction = typeof tokenTransactions.$inferSelect;
export type InsertTokenTransaction = typeof tokenTransactions.$inferInsert;

/**
 * Token purchase plans
 * 追加課金プラン定義（1000円単位・割引率付き）
 */
export const TOKEN_PURCHASE_PLANS = [
  { id: "plan_1000",  priceJpy: 1000,  tokens: 2400,   label: "\u00a51,000",  discountRate: 0 },
  { id: "plan_3000",  priceJpy: 3000,  tokens: 7200,   label: "\u00a53,000",  discountRate: 0 },
  { id: "plan_5000",  priceJpy: 5000,  tokens: 12500,  label: "\u00a55,000",  discountRate: 3 },
  { id: "plan_10000", priceJpy: 10000, tokens: 25500,  label: "\u00a510,000", discountRate: 6 },
  { id: "plan_30000", priceJpy: 30000, tokens: 76000,  label: "\u00a530,000", discountRate: 10 },
  { id: "plan_50000", priceJpy: 50000, tokens: 126000, label: "\u00a550,000", discountRate: 13 },
] as const;

export type TokenPurchasePlan = typeof TOKEN_PURCHASE_PLANS[number];

/**
 * 月額支給トークン数
 * 月額¥19,800 → 50,000T（単価: 0.396円/T、AIコスト: 0.1188円/T、利益率: 70%）
 */
export const MONTHLY_TOKEN_GRANT = 50000;

/**
 * 各機能のトークン消費レート
 * APIコスト ÷ 0.1188円/T（利益率70%維持）
 */
export const TOKEN_COSTS = {
  // 音声書き起こし（分単位）
  transcribe_elevenlabs: 6,   // ElevenLabs Scribe v2: 6T/分
  transcribe_gemini: 2,       // Gemini 2.5/3 Flash: 2T/分
  // テキスト生成（回単位）
  summarize: 5,               // 要約生成: 5T/回
  generate_minutes: 8,        // 議事録生成: 8T/回
  generate_karte: 8,          // カルテ生成: 8T/回
  bizwriter_generate: 6,      // AI文章作成: 6T/回
  shozai_analyze: 12,         // 商材ドクター分析: 12T/回
  shozai_diagnose: 12,        // 商材ドクター診断: 12T/回
  image_edit: 6,              // 画像加工（1枚）: 6T/回
} as const;

export type TokenCostKey = keyof typeof TOKEN_COSTS;
