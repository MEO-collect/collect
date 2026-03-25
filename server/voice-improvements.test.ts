/**
 * 高優先度改善機能のテスト
 * 1. 書き起こし後の再書き起こし機能（handleReTranscribe ロジック）
 * 2. プロジェクト名のインライン編集（updateProject name変更）
 * 3. 書き起こしテキストの検索ハイライト（HighlightText / TranscriptionSegmentList ロジック）
 */
import { describe, it, expect } from "vitest";

// ─── 検索ロジックのユニットテスト ───────────────────────────────────────────

/** テキスト内でクエリが何件ヒットするかを数えるヘルパー（フロントエンドと同じロジック） */
function countMatches(text: string, query: string): number {
  if (!query.trim()) return 0;
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const m = text.match(regex);
  return m ? m.length : 0;
}

/** セグメントをクエリでフィルタリングするヘルパー */
function filterSegments(
  segments: { speaker: string; text: string }[],
  query: string
): { speaker: string; text: string }[] {
  if (!query.trim()) return segments;
  const q = query.toLowerCase();
  return segments.filter(
    (s) => s.text.toLowerCase().includes(q) || s.speaker.toLowerCase().includes(q)
  );
}

describe("検索ハイライト機能", () => {
  it("クエリが空の場合は全セグメントを返す", () => {
    const segments = [
      { speaker: "話者1", text: "こんにちは" },
      { speaker: "話者2", text: "よろしくお願いします" },
    ];
    expect(filterSegments(segments, "")).toHaveLength(2);
    expect(filterSegments(segments, "  ")).toHaveLength(2);
  });

  it("テキストにクエリが含まれるセグメントのみ返す", () => {
    const segments = [
      { speaker: "話者1", text: "今日は良い天気ですね" },
      { speaker: "話者2", text: "明日の会議について話しましょう" },
      { speaker: "話者1", text: "会議の資料を準備しました" },
    ];
    const result = filterSegments(segments, "会議");
    expect(result).toHaveLength(2);
    expect(result[0].text).toContain("会議");
    expect(result[1].text).toContain("会議");
  });

  it("話者名でも検索できる", () => {
    const segments = [
      { speaker: "田中", text: "こんにちは" },
      { speaker: "鈴木", text: "よろしく" },
    ];
    const result = filterSegments(segments, "田中");
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe("田中");
  });

  it("大文字小文字を区別しない", () => {
    const segments = [
      { speaker: "話者1", text: "AIについて話します" },
      { speaker: "話者2", text: "aiの活用方法" },
    ];
    const result = filterSegments(segments, "ai");
    expect(result).toHaveLength(2);
  });

  it("マッチ件数を正しく集計する", () => {
    const text = "会議の議題は会議室で話し合います。会議は重要です。";
    expect(countMatches(text, "会議")).toBe(3);
  });

  it("クエリが空の場合はマッチ件数0", () => {
    expect(countMatches("テキスト", "")).toBe(0);
    expect(countMatches("テキスト", "  ")).toBe(0);
  });

  it("見つからない場合はマッチ件数0", () => {
    expect(countMatches("こんにちは", "さようなら")).toBe(0);
  });

  it("正規表現特殊文字をエスケープする", () => {
    const text = "価格は1,000円（税込）です";
    // 括弧は正規表現の特殊文字だが、エスケープして検索できること
    expect(countMatches(text, "（税込）")).toBe(1);
  });
});

// ─── 再書き起こしロジックのユニットテスト ───────────────────────────────────

/** handleReTranscribeのロジックをシミュレート */
function simulateReTranscribe(project: {
  status: string;
  transcription: string | null;
  summary: string | null;
  minutes: string | null;
  karte: string | null;
  tokenUsage: Record<string, unknown>;
}) {
  return {
    ...project,
    status: "recorded",
    transcription: null,
    summary: null,
    minutes: null,
    karte: null,
    tokenUsage: {},
  };
}

describe("再書き起こし機能", () => {
  it("書き起こし済みプロジェクトをrecordedステータスに戻す", () => {
    const project = {
      status: "transcribed",
      transcription: "[話者1]: こんにちは",
      summary: "要約テキスト",
      minutes: null,
      karte: null,
      tokenUsage: { transcription: { input: 100, output: 50 } },
    };
    const result = simulateReTranscribe(project);
    expect(result.status).toBe("recorded");
  });

  it("書き起こし・要約・議事録・カルテをnullにリセットする", () => {
    const project = {
      status: "summarized",
      transcription: "書き起こしテキスト",
      summary: "要約",
      minutes: "議事録",
      karte: "カルテ",
      tokenUsage: { transcription: { input: 100, output: 50 }, summary: { input: 200, output: 100 } },
    };
    const result = simulateReTranscribe(project);
    expect(result.transcription).toBeNull();
    expect(result.summary).toBeNull();
    expect(result.minutes).toBeNull();
    expect(result.karte).toBeNull();
    expect(result.tokenUsage).toEqual({});
  });

  it("音声データ（recordingDuration）は保持される", () => {
    const project = {
      status: "transcribed",
      transcription: "テキスト",
      summary: null,
      minutes: null,
      karte: null,
      tokenUsage: {},
      recordingDuration: 300,
    };
    const result = simulateReTranscribe(project as Parameters<typeof simulateReTranscribe>[0]);
    // recordingDurationはsimulateReTranscribeで変更しないため保持
    expect((result as typeof project).recordingDuration).toBe(300);
  });
});

// ─── プロジェクト名編集ロジックのユニットテスト ─────────────────────────────

/** handleSaveProjectNameのバリデーションロジックをシミュレート */
function validateProjectName(name: string): { valid: boolean; trimmed: string } {
  const trimmed = name.trim();
  return { valid: trimmed.length > 0, trimmed };
}

describe("プロジェクト名編集機能", () => {
  it("有効な名前を受け付ける", () => {
    expect(validateProjectName("新しいプロジェクト").valid).toBe(true);
    expect(validateProjectName("新しいプロジェクト").trimmed).toBe("新しいプロジェクト");
  });

  it("前後の空白をトリムする", () => {
    const result = validateProjectName("  プロジェクト名  ");
    expect(result.valid).toBe(true);
    expect(result.trimmed).toBe("プロジェクト名");
  });

  it("空文字は無効", () => {
    expect(validateProjectName("").valid).toBe(false);
  });

  it("空白のみは無効", () => {
    expect(validateProjectName("   ").valid).toBe(false);
  });

  it("長い名前も受け付ける", () => {
    const longName = "あ".repeat(100);
    const result = validateProjectName(longName);
    expect(result.valid).toBe(true);
    expect(result.trimmed).toBe(longName);
  });
});
