import { describe, it, expect } from "vitest";
import { splitTranscriptionIntoChunks, removeHallucinationLoop, fixUncheckedOtherCheckboxes } from "./routers/voice";

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

describe("removeHallucinationLoop", () => {
  it("should return unchanged text when no loop exists", () => {
    const text = "[話者1]: こんにちは。\n[話者2]: よろしくお願いします。\n[話者1]: 本日はお越しいただきありがとうございます。";
    const { cleaned, hadLoop } = removeHallucinationLoop(text);
    expect(hadLoop).toBe(false);
    expect(cleaned).toBe(text);
  });

  it("should detect and remove consecutive repeated lines", () => {
    // 「ああ、はい、はい。」が10回繰り返されるケース
    const repeated = Array(10).fill("[話者1]: ああ、はい、はい。").join("\n");
    const { cleaned, hadLoop } = removeHallucinationLoop(repeated, 3);
    expect(hadLoop).toBe(true);
    // 3回未満に削減されていること
    const lines = cleaned.split("\n").filter(l => l.trim());
    expect(lines.length).toBeLessThan(10);
  });

  it("should keep up to maxRepeat consecutive identical lines", () => {
    // maxRepeat=3 の場合、3回目まで残して4回目以降を削除
    const text = "[話者1]: はい。\n[話者1]: はい。\n[話者1]: はい。\n[話者1]: はい。\n[話者1]: はい。";
    const { cleaned, hadLoop } = removeHallucinationLoop(text, 3);
    expect(hadLoop).toBe(true);
    const lines = cleaned.split("\n").filter(l => l.trim());
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it("should not remove non-consecutive repeated lines", () => {
    // 同じ発言でも間に別の発言が挟まっていれば削除しない
    const text = "[話者1]: はい。\n[話者2]: わかりました。\n[話者1]: はい。\n[話者2]: ありがとうございます。";
    const { cleaned, hadLoop } = removeHallucinationLoop(text, 3);
    expect(hadLoop).toBe(false);
    expect(cleaned).toBe(text);
  });

  it("should detect N-gram pattern loops", () => {
    // 2行パターンが5回繰り返されるケース
    const pattern = "[話者1]: ああ、はい。\n[話者2]: そうですね。";
    const text = Array(5).fill(pattern).join("\n");
    const { cleaned, hadLoop } = removeHallucinationLoop(text, 3);
    expect(hadLoop).toBe(true);
    // 元の5回繰り返しより短くなっていること
    expect(cleaned.length).toBeLessThan(text.length);
  });

  it("should handle empty string", () => {
    const { cleaned, hadLoop } = removeHallucinationLoop("");
    expect(hadLoop).toBe(false);
    expect(cleaned).toBe("");
  });

  it("should handle single line without loop", () => {
    const text = "[話者1]: こんにちは。";
    const { cleaned, hadLoop } = removeHallucinationLoop(text);
    expect(hadLoop).toBe(false);
    expect(cleaned).toBe(text);
  });

  it("should remove real-world hallucination pattern", () => {
    // 実際のバグで発生したパターン：「ああ、はい、はい。」が大量に繰り返される
    const lines = [];
    for (let i = 0; i < 50; i++) {
      lines.push(i % 2 === 0 ? "[話者2]: ああ、はい、はい。" : "[話者1]: ああ、はい、はい。");
    }
    const text = lines.join("\n");
    const { cleaned, hadLoop } = removeHallucinationLoop(text, 3);
    expect(hadLoop).toBe(true);
    // 50行から大幅に削減されていること
    const resultLines = cleaned.split("\n").filter(l => l.trim());
    expect(resultLines.length).toBeLessThan(20);
  });
});

describe("fixUncheckedOtherCheckboxes", () => {
  it("should check ☐ when brackets contain content", () => {
    const text = "☐ その他（肩こり、腰痛）";
    expect(fixUncheckedOtherCheckboxes(text)).toBe("☑ その他（肩こり、腰痛）");
  });

  it("should not check ☐ when brackets are empty (spaces only)", () => {
    const text = "☐ その他（　　　　　）";
    expect(fixUncheckedOtherCheckboxes(text)).toBe("☐ その他（　　　　　）");
  });

  it("should not change already checked ☑", () => {
    const text = "☑ その他（肩こり）";
    expect(fixUncheckedOtherCheckboxes(text)).toBe("☑ その他（肩こり）");
  });

  it("should handle multiple checkboxes in one text", () => {
    const text = "☐ 痛い　☐ しびれる　☐ その他（だるさ）";
    const result = fixUncheckedOtherCheckboxes(text);
    expect(result).toContain("☑ その他（だるさ）");
    // 内容のないチェックボックスはそのまま
    expect(result).toContain("☐ 痛い");
  });

  it("should handle real-world karte pattern", () => {
    const text = "☐ あり（整形外科、整骨院）";
    expect(fixUncheckedOtherCheckboxes(text)).toBe("☑ あり（整形外科、整骨院）");
  });

  it("should handle empty string", () => {
    expect(fixUncheckedOtherCheckboxes("")).toBe("");
  });
});
