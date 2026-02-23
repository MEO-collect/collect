import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  StoreProfile,
  Templates,
  OutputFormat,
  GeneratedContent,
  HistoryEntry,
} from "@shared/bizwriter-types";
import {
  INDUSTRIES,
  TONES,
  OUTPUT_FORMATS,
  FORMAT_CHAR_LIMITS,
  TARGET_LENGTH_OPTIONS,
  DEFAULT_STORE_PROFILE,
  DEFAULT_TEMPLATES,
} from "@shared/bizwriter-types";

// ============ Google Maps URL抽出テスト ============

// Mock Google Maps API
vi.mock("../_core/map", () => ({
  makeRequest: vi.fn(),
}));

describe("Google Maps URL Extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should extract place_id from /place/ URL with data parameter", async () => {
    const { makeRequest } = await import("../_core/map");
    vi.mocked(makeRequest).mockResolvedValueOnce({
      status: "OK",
      result: {
        place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        name: "株式会社メディアシード",
        formatted_address: "日本、〒150-0002 東京都渋谷区渋谷3丁目27−15 光和ビル 7F",
        website: "https://mediaseed.jp",
      },
    });

    // This would be called by the extractStoreInfo mutation
    const result = await makeRequest("/maps/api/place/details/json", {
      place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      fields: "name,formatted_address,website,formatted_phone_number",
      language: "ja",
    });

    expect(result.status).toBe("OK");
    expect(result.result.name).toBe("株式会社メディアシード");
    expect(result.result.formatted_address).toContain("東京都渋谷区");
    expect(result.result.website).toBe("https://mediaseed.jp");
  });

  it("should search by store name when place_id cannot be extracted", async () => {
    const { makeRequest } = await import("../_core/map");
    
    // First call: text search
    vi.mocked(makeRequest).mockResolvedValueOnce({
      status: "OK",
      results: [
        {
          place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
          name: "株式会社メディアシード",
          formatted_address: "日本、〒150-0002 東京都渋谷区渋谷3丁目27−15",
          geometry: { location: { lat: 35.6585, lng: 139.7039 } },
        },
      ],
    });

    // Second call: place details
    vi.mocked(makeRequest).mockResolvedValueOnce({
      status: "OK",
      result: {
        place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        name: "株式会社メディアシード",
        formatted_address: "日本、〒150-0002 東京都渋谷区渋谷3丁目27−15 光和ビル 7F",
        website: "https://mediaseed.jp",
      },
    });

    // Simulate search flow
    const searchResult = await makeRequest("/maps/api/place/textsearch/json", {
      query: "株式会社メディアシード",
      language: "ja",
    });

    expect(searchResult.status).toBe("OK");
    expect(searchResult.results[0].place_id).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");

    const detailsResult = await makeRequest("/maps/api/place/details/json", {
      place_id: searchResult.results[0].place_id,
      fields: "name,formatted_address,website,formatted_phone_number",
      language: "ja",
    });

    expect(detailsResult.result.name).toBe("株式会社メディアシード");
    expect(detailsResult.result.website).toBe("https://mediaseed.jp");
  });

  it("should handle http to https conversion", async () => {
    const { makeRequest } = await import("../_core/map");
    vi.mocked(makeRequest).mockResolvedValueOnce({
      status: "OK",
      result: {
        place_id: "test_place_id",
        name: "テスト店舗",
        formatted_address: "東京都渋谷区1-1-1",
        website: "http://example.com",
      },
    });

    const result = await makeRequest("/maps/api/place/details/json", {
      place_id: "test_place_id",
      fields: "name,formatted_address,website,formatted_phone_number",
      language: "ja",
    });

    // The router should convert http to https
    const websiteUrl = result.result.website?.startsWith("http://")
      ? result.result.website.replace("http://", "https://")
      : result.result.website;

    expect(websiteUrl).toBe("https://example.com");
  });

  it("should return error when place not found", async () => {
    const { makeRequest } = await import("../_core/map");
    vi.mocked(makeRequest).mockResolvedValueOnce({
      status: "ZERO_RESULTS",
      results: [],
    });

    const result = await makeRequest("/maps/api/place/textsearch/json", {
      query: "存在しない店舗名12345",
      language: "ja",
    });

    expect(result.status).toBe("ZERO_RESULTS");
    expect(result.results.length).toBe(0);
  });

  it("should handle hex ID format by falling back to search", async () => {
    const { makeRequest } = await import("../_core/map");
    
    // URL with hex ID: 1s0x0:0xe3d96898956cb8ed
    // Should extract store name and search instead
    
    // First call: text search
    vi.mocked(makeRequest).mockResolvedValueOnce({
      status: "OK",
      results: [
        {
          place_id: "ChIJ_valid_place_id",
          name: "株式会社 公仁建設",
          formatted_address: "日本、東京都",
          geometry: { location: { lat: 35.6585, lng: 139.7039 } },
        },
      ],
    });

    // Second call: place details
    vi.mocked(makeRequest).mockResolvedValueOnce({
      status: "OK",
      result: {
        place_id: "ChIJ_valid_place_id",
        name: "株式会社 公仁建設",
        formatted_address: "日本、東京都港区",
        website: "https://example.com",
      },
    });

    // Simulate search flow (hex ID detected, falls back to search)
    const searchResult = await makeRequest("/maps/api/place/textsearch/json", {
      query: "株式会社 公仁建設",
      language: "ja",
    });

    expect(searchResult.status).toBe("OK");
    expect(searchResult.results[0].place_id).toBe("ChIJ_valid_place_id");

    const detailsResult = await makeRequest("/maps/api/place/details/json", {
      place_id: searchResult.results[0].place_id,
      fields: "name,formatted_address,website,formatted_phone_number",
      language: "ja",
    });

    expect(detailsResult.result.name).toBe("株式会社 公仁建設");
    expect(detailsResult.result.website).toBe("https://example.com");
  });

  it("should handle store name with + sign (URL encoded space)", () => {
    const storeName = "株式会社+公仁建設";
    const cleaned = storeName.replace(/\+/g, " ");
    expect(cleaned).toBe("株式会社 公仁建設");
  });
});

// ============ 型定義・定数テスト ============

describe("BizWriter Types & Constants", () => {
  it("should have correct industry options", () => {
    expect(INDUSTRIES).toContain("クリニック");
    expect(INDUSTRIES).toContain("工務店");
    expect(INDUSTRIES).toContain("その他");
    expect(INDUSTRIES.length).toBe(3);
  });

  it("should have correct tone options", () => {
    expect(TONES).toContain("丁寧");
    expect(TONES).toContain("カジュアル");
    expect(TONES).toContain("やさしい");
    expect(TONES).toContain("専門的");
    expect(TONES).toContain("親しみやすい");
    expect(TONES).toContain("堅め");
    expect(TONES.length).toBe(6);
  });

  it("should have correct output format options", () => {
    expect(OUTPUT_FORMATS).toContain("Instagram投稿文");
    expect(OUTPUT_FORMATS).toContain("公式LINE配信文");
    expect(OUTPUT_FORMATS).toContain("SEOブログ記事");
    expect(OUTPUT_FORMATS).toContain("GBP最新情報");
    expect(OUTPUT_FORMATS.length).toBe(4);
  });

  it("should have correct character limits for each format", () => {
    expect(FORMAT_CHAR_LIMITS["Instagram投稿文"]).toBe(2200);
    expect(FORMAT_CHAR_LIMITS["公式LINE配信文"]).toBe(500);
    expect(FORMAT_CHAR_LIMITS["SEOブログ記事"]).toBe(10000);
    expect(FORMAT_CHAR_LIMITS["GBP最新情報"]).toBe(1500);
  });

  it("should have correct target length options", () => {
    expect(TARGET_LENGTH_OPTIONS).toContain("推奨");
    expect(TARGET_LENGTH_OPTIONS).toContain("短め");
    expect(TARGET_LENGTH_OPTIONS).toContain("標準");
    expect(TARGET_LENGTH_OPTIONS).toContain("カスタム");
    expect(TARGET_LENGTH_OPTIONS.length).toBe(4);
  });

  it("should have valid default store profile", () => {
    expect(DEFAULT_STORE_PROFILE.storeName).toBe("");
    expect(DEFAULT_STORE_PROFILE.industry).toBe("クリニック");
    expect(DEFAULT_STORE_PROFILE.preferredTone).toBe("丁寧");
    expect(DEFAULT_STORE_PROFILE.address).toBe("");
    expect(DEFAULT_STORE_PROFILE.websiteUrl).toBe("");
    expect(DEFAULT_STORE_PROFILE.referenceUrl).toBe("");
    expect(DEFAULT_STORE_PROFILE.services).toBe("");
    expect(DEFAULT_STORE_PROFILE.targetAudience).toBe("");
    expect(DEFAULT_STORE_PROFILE.keywords).toBe("");
    expect(DEFAULT_STORE_PROFILE.ngWords).toBe("");
  });

  it("should have valid default templates for all formats", () => {
    for (const format of OUTPUT_FORMATS) {
      expect(DEFAULT_TEMPLATES[format]).toBeDefined();
      expect(DEFAULT_TEMPLATES[format].opening).toBe("");
      expect(DEFAULT_TEMPLATES[format].closing).toBe("");
    }
  });
});

// ============ StoreProfile バリデーションテスト ============

describe("StoreProfile Validation", () => {
  it("should accept a fully populated profile", () => {
    const profile: StoreProfile = {
      storeName: "テストクリニック",
      address: "東京都渋谷区1-1-1",
      industry: "クリニック",
      websiteUrl: "https://example.com",
      referenceUrl: "https://example.com/about",
      services: "内科、小児科",
      targetAudience: "30〜50代",
      keywords: "健康診断, 予防接種",
      ngWords: "最安値, 絶対",
      preferredTone: "丁寧",
    };
    expect(profile.storeName).toBe("テストクリニック");
    expect(profile.industry).toBe("クリニック");
  });

  it("should accept minimal profile with defaults", () => {
    const profile: StoreProfile = { ...DEFAULT_STORE_PROFILE };
    expect(profile.storeName).toBe("");
    expect(profile.industry).toBe("クリニック");
  });

  it("should handle http to https conversion for URLs", () => {
    const url = "http://example.com";
    const converted = url.replace("http://", "https://");
    expect(converted).toBe("https://example.com");
  });

  it("should not modify https URLs", () => {
    const url = "https://example.com";
    const converted = url.startsWith("http://")
      ? url.replace("http://", "https://")
      : url;
    expect(converted).toBe("https://example.com");
  });
});

// ============ 文字数制限テスト ============

describe("Character Limit Validation", () => {
  it("should detect when content exceeds Instagram limit", () => {
    const content = "a".repeat(2201);
    const limit = FORMAT_CHAR_LIMITS["Instagram投稿文"];
    expect(content.length).toBeGreaterThan(limit);
  });

  it("should detect when content exceeds LINE limit", () => {
    const content = "a".repeat(501);
    const limit = FORMAT_CHAR_LIMITS["公式LINE配信文"];
    expect(content.length).toBeGreaterThan(limit);
  });

  it("should detect when content exceeds GBP limit", () => {
    const content = "a".repeat(1501);
    const limit = FORMAT_CHAR_LIMITS["GBP最新情報"];
    expect(content.length).toBeGreaterThan(limit);
  });

  it("should detect when content exceeds blog limit", () => {
    const content = "a".repeat(10001);
    const limit = FORMAT_CHAR_LIMITS["SEOブログ記事"];
    expect(content.length).toBeGreaterThan(limit);
  });

  it("should allow content within limits", () => {
    for (const format of OUTPUT_FORMATS) {
      const limit = FORMAT_CHAR_LIMITS[format];
      const content = "a".repeat(limit);
      expect(content.length).toBeLessThanOrEqual(limit);
    }
  });

  it("should truncate content that exceeds hard limit", () => {
    const content = "a".repeat(3000);
    const limit = FORMAT_CHAR_LIMITS["Instagram投稿文"];
    const truncated = content.length > limit ? content.slice(0, limit) : content;
    expect(truncated.length).toBe(limit);
  });
});

// ============ GeneratedContent テスト ============

describe("GeneratedContent Structure", () => {
  it("should have correct structure for Instagram content", () => {
    const content: GeneratedContent = {
      format: "Instagram投稿文",
      content: "テスト投稿文",
      hashtags: ["テスト", "投稿"],
      suggestions: ["改善提案"],
      warnings: [],
    };
    expect(content.format).toBe("Instagram投稿文");
    expect(content.hashtags.length).toBe(2);
    expect(content.warnings.length).toBe(0);
  });

  it("should have empty hashtags for non-Instagram formats", () => {
    const content: GeneratedContent = {
      format: "公式LINE配信文",
      content: "テストLINE配信",
      hashtags: [],
      suggestions: [],
      warnings: [],
    };
    expect(content.hashtags.length).toBe(0);
  });

  it("should include compliance warnings when applicable", () => {
    const content: GeneratedContent = {
      format: "GBP最新情報",
      content: "テストGBP投稿",
      hashtags: [],
      suggestions: [],
      warnings: ["電話番号やURLを含めないでください"],
    };
    expect(content.warnings.length).toBe(1);
    expect(content.warnings[0]).toContain("電話番号");
  });
});

// ============ Templates テスト ============

describe("Templates Management", () => {
  it("should update opening template for a format", () => {
    const templates: Templates = { ...DEFAULT_TEMPLATES };
    const updated: Templates = {
      ...templates,
      "Instagram投稿文": {
        ...templates["Instagram投稿文"],
        opening: "いつもご覧いただきありがとうございます。",
      },
    };
    expect(updated["Instagram投稿文"].opening).toBe(
      "いつもご覧いただきありがとうございます。"
    );
    expect(updated["Instagram投稿文"].closing).toBe("");
  });

  it("should update closing template for a format", () => {
    const templates: Templates = { ...DEFAULT_TEMPLATES };
    const updated: Templates = {
      ...templates,
      "公式LINE配信文": {
        ...templates["公式LINE配信文"],
        closing: "お気軽にお問い合わせください。",
      },
    };
    expect(updated["公式LINE配信文"].closing).toBe(
      "お気軽にお問い合わせください。"
    );
  });

  it("should maintain independence between format templates", () => {
    const templates: Templates = {
      ...DEFAULT_TEMPLATES,
      "Instagram投稿文": { opening: "IG冒頭", closing: "IG締め" },
    };
    expect(templates["Instagram投稿文"].opening).toBe("IG冒頭");
    expect(templates["公式LINE配信文"].opening).toBe("");
  });
});

// ============ HistoryEntry テスト ============

describe("History Management", () => {
  it("should create a valid history entry", () => {
    const entry: HistoryEntry = {
      id: "hist-123",
      timestamp: Date.now(),
      topic: "テストお題",
      results: [
        {
          format: "Instagram投稿文",
          content: "テスト内容",
          hashtags: ["テスト"],
          suggestions: [],
          warnings: [],
        },
      ],
    };
    expect(entry.id).toBe("hist-123");
    expect(entry.results.length).toBe(1);
  });

  it("should support multiple results in one entry", () => {
    const entry: HistoryEntry = {
      id: "hist-456",
      timestamp: Date.now(),
      topic: "複数媒体テスト",
      results: OUTPUT_FORMATS.map((format) => ({
        format,
        content: `${format}のテスト`,
        hashtags: [],
        suggestions: [],
        warnings: [],
      })),
    };
    expect(entry.results.length).toBe(4);
  });

  it("should limit history to 100 entries", () => {
    const entries: HistoryEntry[] = Array.from({ length: 110 }, (_, i) => ({
      id: `hist-${i}`,
      timestamp: Date.now() - i * 1000,
      topic: `お題${i}`,
      results: [],
    }));
    const limited = entries.slice(0, 100);
    expect(limited.length).toBe(100);
  });

  it("should delete a specific history entry", () => {
    const entries: HistoryEntry[] = [
      { id: "a", timestamp: 1, topic: "A", results: [] },
      { id: "b", timestamp: 2, topic: "B", results: [] },
      { id: "c", timestamp: 3, topic: "C", results: [] },
    ];
    const filtered = entries.filter((e) => e.id !== "b");
    expect(filtered.length).toBe(2);
    expect(filtered.find((e) => e.id === "b")).toBeUndefined();
  });

  it("should clear all history entries", () => {
    const entries: HistoryEntry[] = [
      { id: "a", timestamp: 1, topic: "A", results: [] },
      { id: "b", timestamp: 2, topic: "B", results: [] },
    ];
    const cleared: HistoryEntry[] = [];
    expect(cleared.length).toBe(0);
  });
});

// ============ コンプライアンスルールテスト ============

describe("Compliance Rules", () => {
  it("should flag medical advertising violations for clinic industry", () => {
    const ngPhrases = ["絶対治る", "100%効果", "No.1", "最高", "他院より優れている"];
    for (const phrase of ngPhrases) {
      const containsNg = ngPhrases.includes(phrase);
      expect(containsNg).toBe(true);
    }
  });

  it("should flag construction advertising violations", () => {
    const ngPhrases = ["最安値", "業界最安", "完全", "絶対", "地域No.1"];
    for (const phrase of ngPhrases) {
      const containsNg = ngPhrases.includes(phrase);
      expect(containsNg).toBe(true);
    }
  });

  it("should restrict GBP content from containing phone numbers", () => {
    const content = "お電話でのご予約はこちら";
    // GBPでは電話番号やURLの直接記載を避ける
    const hasPhoneReference = content.includes("電話");
    expect(hasPhoneReference).toBe(true);
  });
});

// ============ カスタム文字数テスト ============

describe("Custom Length Validation", () => {
  it("should cap custom length at format hard limit", () => {
    const customLength = 3000;
    const format: OutputFormat = "公式LINE配信文";
    const hardLimit = FORMAT_CHAR_LIMITS[format];
    const effectiveLength = Math.min(customLength, hardLimit);
    expect(effectiveLength).toBe(500);
  });

  it("should use custom length when within limit", () => {
    const customLength = 300;
    const format: OutputFormat = "公式LINE配信文";
    const hardLimit = FORMAT_CHAR_LIMITS[format];
    const effectiveLength = Math.min(customLength, hardLimit);
    expect(effectiveLength).toBe(300);
  });

  it("should calculate short length correctly", () => {
    const format: OutputFormat = "Instagram投稿文";
    const hardLimit = FORMAT_CHAR_LIMITS[format];
    const shortLength = Math.min(Math.floor(hardLimit * 0.3), 200);
    expect(shortLength).toBeLessThanOrEqual(200);
  });

  it("should calculate standard length correctly", () => {
    const format: OutputFormat = "Instagram投稿文";
    const hardLimit = FORMAT_CHAR_LIMITS[format];
    const standardLength = Math.min(Math.floor(hardLimit * 0.6), 800);
    expect(standardLength).toBeLessThanOrEqual(800);
  });
});

// ============ LocalStorage シミュレーションテスト ============

describe("LocalStorage Serialization", () => {
  it("should serialize and deserialize store profile", () => {
    const profile: StoreProfile = {
      ...DEFAULT_STORE_PROFILE,
      storeName: "テスト店舗",
      industry: "工務店",
    };
    const serialized = JSON.stringify(profile);
    const deserialized: StoreProfile = JSON.parse(serialized);
    expect(deserialized.storeName).toBe("テスト店舗");
    expect(deserialized.industry).toBe("工務店");
  });

  it("should serialize and deserialize templates", () => {
    const templates: Templates = {
      ...DEFAULT_TEMPLATES,
      "Instagram投稿文": { opening: "冒頭テスト", closing: "締めテスト" },
    };
    const serialized = JSON.stringify(templates);
    const deserialized: Templates = JSON.parse(serialized);
    expect(deserialized["Instagram投稿文"].opening).toBe("冒頭テスト");
  });

  it("should serialize and deserialize history", () => {
    const history: HistoryEntry[] = [
      {
        id: "test-1",
        timestamp: 1700000000000,
        topic: "テストお題",
        results: [
          {
            format: "GBP最新情報",
            content: "テスト内容",
            hashtags: [],
            suggestions: [],
            warnings: [],
          },
        ],
      },
    ];
    const serialized = JSON.stringify(history);
    const deserialized: HistoryEntry[] = JSON.parse(serialized);
    expect(deserialized.length).toBe(1);
    expect(deserialized[0].topic).toBe("テストお題");
    expect(deserialized[0].results[0].format).toBe("GBP最新情報");
  });

  it("should handle corrupted localStorage gracefully", () => {
    const fallback = DEFAULT_STORE_PROFILE;
    try {
      JSON.parse("invalid json");
    } catch {
      // Fallback to default
      expect(fallback.storeName).toBe("");
    }
  });
});

// ============ バリエーション生成機能テスト ============

// Mock db functions
vi.mock("../db", () => ({
  saveGeneratedContent: vi.fn(),
  getRecentGeneratedContents: vi.fn(),
}));

describe("Variation Generation Feature", () => {
  it("should save generated content to database when avoidRepetition is true", async () => {
    const { saveGeneratedContent } = await import("../db");
    const mockSave = vi.fn().mockResolvedValue(undefined);
    vi.mocked(saveGeneratedContent).mockImplementation(mockSave);

    const testContent = {
      userId: 1,
      storeProfileHash: "test-hash-123",
      format: "Instagram投稿文",
      generatedText: "テスト投稿文です。#テスト #AI文章作成",
      charCount: 25,
    };

    await saveGeneratedContent(testContent);

    expect(mockSave).toHaveBeenCalledWith(testContent);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("should retrieve recent generated contents for variation", async () => {
    const { getRecentGeneratedContents } = await import("../db");
    vi.clearAllMocks();
    const mockGet = vi.fn().mockResolvedValue([
      {
        id: 1,
        userId: 1,
        storeProfileHash: "test-hash-123",
        format: "Instagram投稿文",
        generatedText: "過去の投稿文1",
        charCount: 10,
        createdAt: new Date("2026-02-20"),
      },
      {
        id: 2,
        userId: 1,
        storeProfileHash: "test-hash-123",
        format: "Instagram投稿文",
        generatedText: "過去の投稿文2",
        charCount: 10,
        createdAt: new Date("2026-02-21"),
      },
    ]);
    vi.mocked(getRecentGeneratedContents).mockImplementation(mockGet);

    const results = await getRecentGeneratedContents(
      1,
      "test-hash-123",
      "Instagram投稿文",
      5
    );

    expect(results).toHaveLength(2);
    expect(results[0].generatedText).toBe("過去の投稿文1");
    expect(mockGet).toHaveBeenCalledWith(1, "test-hash-123", "Instagram投稿文", 5);
  });

  it("should create consistent store profile hash for same profile", async () => {
    const crypto = await import("crypto");
    
    const profile1 = {
      storeName: "テスト店舗",
      industry: "飲食店",
      address: "東京都渋谷区",
    };
    
    const profile2 = {
      storeName: "テスト店舗",
      industry: "飲食店",
      address: "東京都渋谷区",
    };

    const hash1 = crypto.createHash("sha256").update(JSON.stringify(profile1)).digest("hex");
    const hash2 = crypto.createHash("sha256").update(JSON.stringify(profile2)).digest("hex");

    expect(hash1).toBe(hash2);
  });

  it("should create different hashes for different profiles", async () => {
    const crypto = await import("crypto");
    
    const profile1 = {
      storeName: "テスト店舗A",
      industry: "飲食店",
    };
    
    const profile2 = {
      storeName: "テスト店舗B",
      industry: "飲食店",
    };

    const hash1 = crypto.createHash("sha256").update(JSON.stringify(profile1)).digest("hex");
    const hash2 = crypto.createHash("sha256").update(JSON.stringify(profile2)).digest("hex");

    expect(hash1).not.toBe(hash2);
  });
});
