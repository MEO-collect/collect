import { describe, it, expect } from "vitest";
import {
  INDUSTRIES,
  DEFAULT_USER_PROFILE,
  WIZARD_STEPS,
  ANALYSIS_STATUS_MESSAGES,
  DIAGNOSIS_STATUS_MESSAGES,
  COST_PER_INPUT_TOKEN_YEN,
  COST_PER_OUTPUT_TOKEN_YEN,
  calculateCostYen,
} from "@shared/shozai-types";
import type {
  UserProfile,
  UploadedFile,
  AnalysisResult,
  DiagnosisResult,
  TokenUsage,
  Verdict,
  Industry,
} from "@shared/shozai-types";

// ============ 型定義テスト ============
describe("shozai-types: 定数と型定義", () => {
  it("INDUSTRIES は11業種を含む", () => {
    expect(INDUSTRIES.length).toBe(11);
    expect(INDUSTRIES).toContain("飲食");
    expect(INDUSTRIES).toContain("美容");
    expect(INDUSTRIES).toContain("建設");
    expect(INDUSTRIES).toContain("IT");
    expect(INDUSTRIES).toContain("医療");
    expect(INDUSTRIES).toContain("不動産");
    expect(INDUSTRIES).toContain("小売");
    expect(INDUSTRIES).toContain("教育");
    expect(INDUSTRIES).toContain("製造");
    expect(INDUSTRIES).toContain("士業（弁護士・税理士等）");
    expect(INDUSTRIES).toContain("その他");
  });

  it("DEFAULT_USER_PROFILE は正しいデフォルト値を持つ", () => {
    expect(DEFAULT_USER_PROFILE.industry).toBe("飲食");
    expect(DEFAULT_USER_PROFILE.address).toBe("");
    expect(DEFAULT_USER_PROFILE.url).toBe("");
  });

  it("WIZARD_STEPS は5ステップ", () => {
    expect(WIZARD_STEPS.length).toBe(5);
    expect(WIZARD_STEPS[0].label).toBe("基本設定");
    expect(WIZARD_STEPS[1].label).toBe("資料アップロード");
    expect(WIZARD_STEPS[2].label).toBe("AI分析");
    expect(WIZARD_STEPS[3].label).toBe("AI診断");
    expect(WIZARD_STEPS[4].label).toBe("診断結果");
  });

  it("ステップIDは1から5の連番", () => {
    WIZARD_STEPS.forEach((step, i) => {
      expect(step.id).toBe(i + 1);
    });
  });

  it("ANALYSIS_STATUS_MESSAGES は空でない", () => {
    expect(ANALYSIS_STATUS_MESSAGES.length).toBeGreaterThan(0);
    ANALYSIS_STATUS_MESSAGES.forEach((msg) => {
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    });
  });

  it("DIAGNOSIS_STATUS_MESSAGES は空でない", () => {
    expect(DIAGNOSIS_STATUS_MESSAGES.length).toBeGreaterThan(0);
    DIAGNOSIS_STATUS_MESSAGES.forEach((msg) => {
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    });
  });
});

// ============ コスト計算テスト ============
describe("shozai-types: コスト計算", () => {
  it("COST_PER_INPUT_TOKEN_YEN は正の値", () => {
    expect(COST_PER_INPUT_TOKEN_YEN).toBeGreaterThan(0);
  });

  it("COST_PER_OUTPUT_TOKEN_YEN は正の値", () => {
    expect(COST_PER_OUTPUT_TOKEN_YEN).toBeGreaterThan(0);
  });

  it("出力トークンは入力トークンより高い", () => {
    expect(COST_PER_OUTPUT_TOKEN_YEN).toBeGreaterThan(COST_PER_INPUT_TOKEN_YEN);
  });

  it("calculateCostYen: 0トークンは0円", () => {
    expect(calculateCostYen(0, 0)).toBe(0);
  });

  it("calculateCostYen: 入力のみのコスト計算", () => {
    const cost = calculateCostYen(1000, 0);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(1); // 1000トークンで1円未満
  });

  it("calculateCostYen: 出力のみのコスト計算", () => {
    const cost = calculateCostYen(0, 1000);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(1);
  });

  it("calculateCostYen: 入力+出力の合算", () => {
    const inputOnly = calculateCostYen(1000, 0);
    const outputOnly = calculateCostYen(0, 1000);
    const combined = calculateCostYen(1000, 1000);
    // 合算は個別の合計と一致（丸め誤差を許容）
    expect(Math.abs(combined - (inputOnly + outputOnly))).toBeLessThan(0.01);
  });

  it("calculateCostYen: 大量トークンのコスト", () => {
    // 100万入力 + 10万出力
    const cost = calculateCostYen(1_000_000, 100_000);
    expect(cost).toBeGreaterThan(0);
    // 概算: 1M * 0.0000225 + 100K * 0.00009 = 22.5 + 9 = 31.5円
    expect(cost).toBeGreaterThan(20);
    expect(cost).toBeLessThan(50);
  });

  it("calculateCostYen: 小数点以下2桁に丸められる", () => {
    const cost = calculateCostYen(12345, 6789);
    const decimalPlaces = cost.toString().split(".")[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });
});

// ============ UserProfile型テスト ============
describe("shozai-types: UserProfile", () => {
  it("有効なプロフィールを作成できる", () => {
    const profile: UserProfile = {
      industry: "飲食",
      address: "東京都渋谷区",
      url: "https://example.com",
    };
    expect(profile.industry).toBe("飲食");
    expect(profile.address).toBe("東京都渋谷区");
    expect(profile.url).toBe("https://example.com");
  });

  it("URLは空文字を許容する", () => {
    const profile: UserProfile = {
      industry: "IT",
      address: "大阪市",
      url: "",
    };
    expect(profile.url).toBe("");
  });
});

// ============ AnalysisResult型テスト ============
describe("shozai-types: AnalysisResult", () => {
  it("全フィールドを持つ分析結果を作成できる", () => {
    const result: AnalysisResult = {
      serviceSummary: "Webサイト制作サービス",
      pricingAndContract: "月額5万円",
      contractPeriod: "12ヶ月",
      optionsAndBenefits: "SEO対策込み",
      salesTactics: "今月限りの特別価格",
      concerns: "解約金が高額",
    };
    expect(result.serviceSummary).toBeTruthy();
    expect(result.pricingAndContract).toBeTruthy();
    expect(result.contractPeriod).toBeTruthy();
    expect(result.optionsAndBenefits).toBeTruthy();
    expect(result.salesTactics).toBeTruthy();
    expect(result.concerns).toBeTruthy();
  });
});

// ============ DiagnosisResult型テスト ============
describe("shozai-types: DiagnosisResult", () => {
  it("全フィールドを持つ診断結果を作成できる", () => {
    const result: DiagnosisResult = {
      validityCheck: "料金は妥当",
      marketComparison: "相場と同程度",
      merits: ["品質が高い", "サポートが充実"],
      demerits: ["価格がやや高い"],
      overchargeWarnings: ["不要なオプションあり"],
      preContractNotes: ["解約条件を確認"],
      verdict: "要検討",
      verdictReason: "価格は妥当だが、契約期間に注意",
    };
    expect(result.merits.length).toBe(2);
    expect(result.demerits.length).toBe(1);
    expect(result.overchargeWarnings.length).toBe(1);
    expect(result.preContractNotes.length).toBe(1);
    expect(result.verdict).toBe("要検討");
  });

  it("Verdictは3種類のみ", () => {
    const verdicts: Verdict[] = ["おすすめ", "要検討", "おすすめしない"];
    expect(verdicts.length).toBe(3);
  });

  it("空配列のメリット・デメリットを許容する", () => {
    const result: DiagnosisResult = {
      validityCheck: "確認済み",
      marketComparison: "比較済み",
      merits: [],
      demerits: [],
      overchargeWarnings: [],
      preContractNotes: [],
      verdict: "おすすめ",
      verdictReason: "問題なし",
    };
    expect(result.merits.length).toBe(0);
    expect(result.demerits.length).toBe(0);
  });
});

// ============ TokenUsage型テスト ============
describe("shozai-types: TokenUsage", () => {
  it("トークン使用量を作成できる", () => {
    const usage: TokenUsage = {
      promptTokens: 5000,
      completionTokens: 2000,
      totalTokens: 7000,
      estimatedCostYen: 0.29,
    };
    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
    expect(usage.estimatedCostYen).toBeGreaterThan(0);
  });

  it("コスト計算と整合する", () => {
    const prompt = 5000;
    const completion = 2000;
    const expected = calculateCostYen(prompt, completion);
    const usage: TokenUsage = {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: prompt + completion,
      estimatedCostYen: expected,
    };
    expect(usage.estimatedCostYen).toBe(expected);
  });
});

// ============ UploadedFile型テスト ============
describe("shozai-types: UploadedFile", () => {
  it("画像ファイルを表現できる", () => {
    const file: UploadedFile = {
      name: "proposal.png",
      type: "image/png",
      size: 1024 * 500,
      base64: "data:image/png;base64,abc123",
      previewUrl: "blob:http://localhost/xxx",
    };
    expect(file.type.startsWith("image/")).toBe(true);
    expect(file.previewUrl).toBeTruthy();
  });

  it("PDFファイルを表現できる", () => {
    const file: UploadedFile = {
      name: "contract.pdf",
      type: "application/pdf",
      size: 1024 * 1024 * 2,
      base64: "data:application/pdf;base64,xyz789",
    };
    expect(file.type).toBe("application/pdf");
    expect(file.previewUrl).toBeUndefined();
  });
});

// ============ Industry型テスト ============
describe("shozai-types: Industry", () => {
  it("全業種が文字列型", () => {
    INDUSTRIES.forEach((ind) => {
      expect(typeof ind).toBe("string");
      expect(ind.length).toBeGreaterThan(0);
    });
  });

  it("重複する業種がない", () => {
    const unique = new Set(INDUSTRIES);
    expect(unique.size).toBe(INDUSTRIES.length);
  });
});
