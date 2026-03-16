import { describe, it, expect } from "vitest";
import { splitTranscriptionIntoChunks } from "./routers/voice";

describe("splitTranscriptionIntoChunks", () => {
  it("短いテキストはそのまま返す", () => {
    const text = "[話者1]: こんにちは\n[話者2]: はい";
    const chunks = splitTranscriptionIntoChunks(text, 8000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("長いテキストを改行で分割する", () => {
    const line = "[話者1]: " + "あ".repeat(100) + "\n";
    const text = line.repeat(100); // 約10000文字
    const chunks = splitTranscriptionIntoChunks(text, 8000);
    expect(chunks.length).toBeGreaterThan(1);
    // 各チャンクが8500文字以下（マージン込み）
    chunks.forEach(chunk => {
      expect(chunk.length).toBeLessThanOrEqual(8500);
    });
    // 結合すると元のテキストに戻る
    expect(chunks.join("")).toBe(text);
  });

  it("チャンク数の計算が正しい", () => {
    const text = "a".repeat(24000);
    const chunks = splitTranscriptionIntoChunks(text, 8000);
    expect(chunks.length).toBe(3);
  });
});
