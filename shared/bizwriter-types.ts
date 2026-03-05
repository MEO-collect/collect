// BizWriter AI - 型定義

export const INDUSTRIES = ["クリニック", "工務店", "その他"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const TONES = ["推奨", "丁寧", "カジュアル", "やさしい", "専門的", "親しみやすい", "堅め"] as const;
export type Tone = (typeof TONES)[number];

// 媒体ごとの推奨トーン
export const FORMAT_RECOMMENDED_TONES: Record<string, string> = {
  "Instagram投稿文": "親しみやすい",
  "公式LINE配信文": "やさしい",
  "SEOブログ記事": "丁寧",
  "GBP最新情報": "丁寧",
};

export const OUTPUT_FORMATS = [
  "Instagram投稿文",
  "公式LINE配信文",
  "SEOブログ記事",
  "GBP最新情報",
] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

// 各媒体の文字数ハードリミット
export const FORMAT_CHAR_LIMITS: Record<OutputFormat, number> = {
  "Instagram投稿文": 2200,
  "公式LINE配信文": 500,
  "SEOブログ記事": 10000,
  "GBP最新情報": 1500,
};

export const TARGET_LENGTH_OPTIONS = ["推奨", "短め", "標準", "カスタム"] as const;
export type TargetLengthOption = (typeof TARGET_LENGTH_OPTIONS)[number];

export interface StoreProfile {
  storeName: string;
  address: string;
  industry: Industry;
  websiteUrl: string;
  referenceUrl: string;
  services: string;
  targetAudience: string;
  keywords: string;
  ngWords: string;
  preferredTone: Tone;
  // 詳細情報（任意）
  businessHours?: string;
  specialties?: string;
  achievements?: string;
  facilities?: string;
  access?: string;
  // 事例（複数）
  caseStudies?: string[];
}

export interface GenerationRequest {
  topic: string;
  formats: OutputFormat[];
  tone: Tone;
  targetLength: TargetLengthOption;
  customLength?: number;
  useTemplates: boolean;
  checkConsistency: boolean;
  useOnlySiteInfo: boolean;
}

export interface GeneratedContent {
  format: OutputFormat;
  content: string;
  hashtags: string[];
  suggestions: string[];
  warnings: string[];
}

export interface TemplateSet {
  opening: string;
  closing: string;
}

export type Templates = Record<OutputFormat, TemplateSet>;

export interface HistoryEntry {
  id: string;
  timestamp: number;
  topic: string;
  results: GeneratedContent[];
}

export const DEFAULT_STORE_PROFILE: StoreProfile = {
  storeName: "",
  address: "",
  industry: "クリニック",
  websiteUrl: "",
  referenceUrl: "",
  services: "",
  targetAudience: "",
  keywords: "",
  ngWords: "",
  preferredTone: "丁寧",
  businessHours: "",
  specialties: "",
  achievements: "",
  facilities: "",
  access: "",
  caseStudies: [],
};

export const DEFAULT_TEMPLATES: Templates = {
  "Instagram投稿文": { opening: "", closing: "" },
  "公式LINE配信文": { opening: "", closing: "" },
  "SEOブログ記事": { opening: "", closing: "" },
  "GBP最新情報": { opening: "", closing: "" },
};
