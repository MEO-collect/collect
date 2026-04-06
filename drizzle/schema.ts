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
