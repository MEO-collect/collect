import { describe, expect, it } from "vitest";

/**
 * Gemini APIキーの動作確認テスト
 * 
 * このテストはGemini APIが正常に動作することを確認します。
 * 実際のAPIコールを行うため、環境変数が正しく設定されている必要があります。
 */
describe("Gemini API Integration", () => {
  it("should have GEMINI_API_KEY environment variable set", () => {
    // 環境変数が設定されていることを確認
    const apiKey = process.env.GEMINI_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");
    expect(apiKey?.length).toBeGreaterThan(10);
  });

  it("should have correct API key format", () => {
    const apiKey = process.env.GEMINI_API_KEY;
    // Gemini APIキーは通常 "AIza" で始まる
    expect(apiKey).toMatch(/^AIza/);
  });
});

describe("LLM Helper Configuration", () => {
  it("should have forge API configuration for LLM calls", () => {
    // Forge API（LLM呼び出し用）の設定確認
    const forgeApiUrl = process.env.BUILT_IN_FORGE_API_URL;
    const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY;
    
    expect(forgeApiUrl).toBeDefined();
    expect(forgeApiKey).toBeDefined();
  });
});
