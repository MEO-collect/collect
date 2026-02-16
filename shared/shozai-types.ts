// ============ 業種リスト ============
export const INDUSTRIES = [
  "飲食",
  "美容",
  "建設",
  "IT",
  "医療",
  "不動産",
  "小売",
  "教育",
  "製造",
  "士業（弁護士・税理士等）",
  "その他",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

// ============ ユーザープロフィール ============
export interface UserProfile {
  industry: Industry;
  address: string;
  url: string;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  industry: "飲食",
  address: "",
  url: "",
};

// ============ アップロードファイル ============
export interface UploadedFile {
  name: string;
  type: string; // MIME type
  size: number;
  base64: string; // data URI
  previewUrl?: string;
}

// ============ AI分析結果（フェーズ3） ============
export interface AnalysisResult {
  serviceSummary: string;
  pricingAndContract: string;
  contractPeriod: string;
  optionsAndBenefits: string;
  salesTactics: string;
  concerns: string;
}

// ============ AI診断結果（フェーズ4・5） ============
export type Verdict = "おすすめ" | "要検討" | "おすすめしない";

export interface DiagnosisResult {
  validityCheck: string;
  marketComparison: string;
  merits: string[];
  demerits: string[];
  overchargeWarnings: string[];
  preContractNotes: string[];
  verdict: Verdict;
  verdictReason: string;
}

// ============ トークン使用量 ============
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostYen: number;
}

// ============ ウィザードステップ ============
export const WIZARD_STEPS = [
  { id: 1, label: "基本設定" },
  { id: 2, label: "資料アップロード" },
  { id: 3, label: "AI分析" },
  { id: 4, label: "AI診断" },
  { id: 5, label: "診断結果" },
] as const;

// ============ コスト計算 ============
// Gemini 2.5 Flash 概算価格（2025年時点）
// Input: $0.15 / 1M tokens, Output: $0.60 / 1M tokens
// 1 USD ≈ 150 JPY
export const COST_PER_INPUT_TOKEN_YEN = 0.15 * 150 / 1_000_000; // ≈ 0.0000225 JPY
export const COST_PER_OUTPUT_TOKEN_YEN = 0.60 * 150 / 1_000_000; // ≈ 0.00009 JPY

export function calculateCostYen(promptTokens: number, completionTokens: number): number {
  return Math.round(
    (promptTokens * COST_PER_INPUT_TOKEN_YEN + completionTokens * COST_PER_OUTPUT_TOKEN_YEN) * 100
  ) / 100;
}

// ============ 分析ステータスメッセージ ============
export const ANALYSIS_STATUS_MESSAGES = [
  "資料を読み込んでいます...",
  "テキストを抽出しています...",
  "サービス内容を分析中...",
  "料金体系を確認中...",
  "契約条件を精査中...",
  "営業トークを検出中...",
  "懸念点を洗い出しています...",
];

export const DIAGNOSIS_STATUS_MESSAGES = [
  "業界相場と照合中...",
  "妥当性をチェック中...",
  "メリット・デメリットを整理中...",
  "過剰請求の有無を確認中...",
  "契約リスクを評価中...",
  "総合判定を算出中...",
  "レポートを生成中...",
];
