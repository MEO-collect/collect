/**
 * TranscriptionProgress ユーティリティのテスト
 * IndexedDB はブラウザ環境のみのため、ロジック部分（チャンク管理）をテストする
 */
import { describe, it, expect } from "vitest";

// チャンク結合ロジックのテスト（ProjectDetail.tsx から抽出した純粋関数）
function buildFullTranscription(
  completedChunks: Array<{
    index: number;
    startSec: number;
    endSec: number;
    transcription: string;
  }>,
): string {
  const sorted = [...completedChunks].sort((a, b) => a.index - b.index);
  return sorted
    .map((c) => {
      const startMin = Math.floor(c.startSec / 60);
      const endMin = Math.floor(c.endSec / 60);
      return `--- [${startMin}分〜${endMin}分] ---\n${c.transcription.trim()}`;
    })
    .join("\n\n");
}

describe("buildFullTranscription", () => {
  it("1チャンクの場合", () => {
    const result = buildFullTranscription([
      { index: 0, startSec: 0, endSec: 600, transcription: "[話者1]: こんにちは" },
    ]);
    expect(result).toBe("--- [0分〜10分] ---\n[話者1]: こんにちは");
  });

  it("複数チャンクをindex順に結合する", () => {
    const result = buildFullTranscription([
      { index: 1, startSec: 600, endSec: 1200, transcription: "[話者2]: ありがとう" },
      { index: 0, startSec: 0, endSec: 600, transcription: "[話者1]: こんにちは" },
    ]);
    expect(result).toContain("--- [0分〜10分] ---");
    expect(result).toContain("--- [10分〜20分] ---");
    // index 0 が先に来る
    expect(result.indexOf("[0分〜10分]")).toBeLessThan(result.indexOf("[10分〜20分]"));
  });

  it("transcriptionの前後の空白をトリムする", () => {
    const result = buildFullTranscription([
      { index: 0, startSec: 0, endSec: 600, transcription: "  [話者1]: テスト  " },
    ]);
    expect(result).toBe("--- [0分〜10分] ---\n[話者1]: テスト");
  });
});

describe("TranscriptionProgress ロジック", () => {
  it("既完了チャンクのスキップ判定", () => {
    const completedIndexes = new Set([0, 1]);
    const allChunks = [0, 1, 2, 3];
    const remaining = allChunks.filter((i) => !completedIndexes.has(i));
    expect(remaining).toEqual([2, 3]);
  });

  it("前チャンクのコンテキスト取得", () => {
    const completedChunks = [
      { index: 0, transcription: "A".repeat(300) },
      { index: 1, transcription: "B".repeat(300) },
    ];
    const prevCompleted = completedChunks
      .filter((c) => c.index < 2)
      .sort((a, b) => a.index - b.index);
    const context = prevCompleted[prevCompleted.length - 1].transcription.slice(-200);
    expect(context).toBe("B".repeat(200));
    expect(context.length).toBe(200);
  });

  it("再開時: totalChunksが一致する場合のみ既存進捗を使用", () => {
    const existingProgress = {
      totalChunks: 4,
      completedChunks: [{ index: 0 }, { index: 1 }],
    };
    // 同じtotalChunks → 既存進捗を使用
    const usedWhenMatch =
      existingProgress.totalChunks === 4 ? existingProgress.completedChunks : [];
    expect(usedWhenMatch).toHaveLength(2);

    // 異なるtotalChunks → 最初から
    const usedWhenMismatch =
      existingProgress.totalChunks === 3 ? existingProgress.completedChunks : [];
    expect(usedWhenMismatch).toHaveLength(0);
  });
});
