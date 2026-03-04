import { describe, it, expect } from "vitest";
import { splitTranscriptionIntoChunks } from "./routers/voice";

describe("splitTranscriptionIntoChunks", () => {
  it("should return single chunk for short text", () => {
    const text = "短いテキスト";
    const chunks = splitTranscriptionIntoChunks(text, 8000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("should return single chunk when text equals chunk size", () => {
    const text = "a".repeat(8000);
    const chunks = splitTranscriptionIntoChunks(text, 8000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("should split long text into multiple chunks", () => {
    // 24000文字のテキスト（8000文字×3チャンク相当）
    const text = "a".repeat(24001);
    const chunks = splitTranscriptionIntoChunks(text, 8000);
    expect(chunks.length).toBeGreaterThan(1);
    // 全チャンクを結合すると元のテキストに戻る
    expect(chunks.join("")).toBe(text);
  });

  it("should split at newline boundaries when possible", () => {
    // 改行で区切られたテキスト
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`[話者${(i % 2) + 1}]: これはテスト発言${i}です。内容が含まれています。`);
    }
    const text = lines.join("\n");
    const chunks = splitTranscriptionIntoChunks(text, 500);

    // 各チャンクが500文字以下であること（±500の余裕を持って）
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1000);
    }

    // 全チャンクを結合すると元のテキストに戻る
    expect(chunks.join("")).toBe(text);
  });

  it("should handle text with no newlines gracefully", () => {
    // 改行なしの長いテキスト
    const text = "あ".repeat(20000);
    const chunks = splitTranscriptionIntoChunks(text, 8000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
  });

  it("should preserve all content across chunks", () => {
    const lines = [];
    for (let i = 0; i < 500; i++) {
      lines.push(`[話者${(i % 3) + 1}]: 発言内容${i}、詳細な情報が含まれています。重要なポイントを述べています。`);
    }
    const text = lines.join("\n");
    const chunks = splitTranscriptionIntoChunks(text, 8000);

    // 全チャンクを結合すると元のテキストに戻る
    const rejoined = chunks.join("");
    expect(rejoined).toBe(text);
  });

  it("should use default chunk size of 8000", () => {
    const shortText = "短いテキスト";
    const chunks = splitTranscriptionIntoChunks(shortText);
    expect(chunks).toHaveLength(1);
  });

  it("should handle empty string", () => {
    const chunks = splitTranscriptionIntoChunks("", 8000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("");
  });

  it("should handle real-world transcription format", () => {
    // 100分の会話を想定（1分あたり約150文字×100分=15000文字）
    const lines = [];
    for (let i = 0; i < 200; i++) {
      lines.push(`[話者${(i % 2) + 1}]: これは${i + 1}番目の発言です。会議の内容について詳しく説明しています。重要な決定事項や次のアクションについて話し合っています。`);
    }
    const text = lines.join("\n");
    expect(text.length).toBeGreaterThan(8000); // 8000文字以上であることを確認

    const chunks = splitTranscriptionIntoChunks(text, 8000);
    expect(chunks.length).toBeGreaterThan(1);

    // 全チャンクを結合すると元のテキストに戻る
    expect(chunks.join("")).toBe(text);
  });
});
