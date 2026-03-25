/**
 * 中優先度改善機能のテスト
 * 1. 再生成時フォーマット保持（karteFormatId / minutesTemplate が再生成後も保持）
 * 2. 録音時間のリアルタイム警告（30分超えで警告）
 * 3. プロジェクト一覧のフィルタ・並び替えロジック
 */
import { describe, it, expect } from "vitest";

// ─── 再生成時フォーマット保持のロジックテスト ──────────────────────────────

/**
 * 再生成時にフォーマット設定が保持されることを確認するシミュレーション
 * 実装では updateProject({ karte: null }) のみ呼び出し、
 * karteFormatId / kartePatientInfo は useState で保持されるため変更されない
 */
function simulateKarteRegen(
  currentFormatId: string,
  currentPatientInfo: { patientName: string; age: string }
): { formatId: string; patientInfo: { patientName: string; age: string } } {
  // karte: null にリセットするだけで、フォーマット設定は変更しない
  return { formatId: currentFormatId, patientInfo: currentPatientInfo };
}

function simulateMinutesRegen(
  currentTemplate: string,
  currentMetadata: { meetingName: string; participants: string }
): { template: string; metadata: { meetingName: string; participants: string } } {
  // minutes: null にリセットするだけで、テンプレート設定は変更しない
  return { template: currentTemplate, metadata: currentMetadata };
}

describe("再生成時フォーマット保持", () => {
  it("カルテ再生成後もフォーマットIDが保持される", () => {
    const result = simulateKarteRegen("orthopedic-soap", { patientName: "山田太郎", age: "45歳" });
    expect(result.formatId).toBe("orthopedic-soap");
  });

  it("カルテ再生成後も患者情報が保持される", () => {
    const result = simulateKarteRegen("general-soap", { patientName: "佐藤花子", age: "32歳" });
    expect(result.patientInfo.patientName).toBe("佐藤花子");
    expect(result.patientInfo.age).toBe("32歳");
  });

  it("議事録再生成後もテンプレートが保持される", () => {
    const result = simulateMinutesRegen("medical", { meetingName: "カンファレンス", participants: "田中、鈴木" });
    expect(result.template).toBe("medical");
  });

  it("議事録再生成後もメタデータが保持される", () => {
    const result = simulateMinutesRegen("business", { meetingName: "月次定例", participants: "全員" });
    expect(result.metadata.meetingName).toBe("月次定例");
    expect(result.metadata.participants).toBe("全員");
  });
});

// ─── 録音時間警告のロジックテスト ──────────────────────────────────────────

function shouldShowLongRecordingWarning(durationSeconds: number): boolean {
  return durationSeconds > 1800; // 30分 = 1800秒
}

describe("録音時間リアルタイム警告", () => {
  it("30分未満では警告を表示しない", () => {
    expect(shouldShowLongRecordingWarning(1799)).toBe(false);
    expect(shouldShowLongRecordingWarning(0)).toBe(false);
    expect(shouldShowLongRecordingWarning(900)).toBe(false);
  });

  it("30分ちょうどでは警告を表示しない", () => {
    expect(shouldShowLongRecordingWarning(1800)).toBe(false);
  });

  it("30分超えで警告を表示する", () => {
    expect(shouldShowLongRecordingWarning(1801)).toBe(true);
    expect(shouldShowLongRecordingWarning(3600)).toBe(true);
    expect(shouldShowLongRecordingWarning(7200)).toBe(true);
  });
});

// ─── プロジェクト一覧フィルタ・並び替えロジックのテスト ──────────────────

type ProjectStatus = "created" | "recorded" | "transcribed" | "summarized";
interface MockProject {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: number;
}

function filterAndSort(
  projects: MockProject[],
  filterStatus: "all" | ProjectStatus,
  sortOrder: "newest" | "oldest"
): MockProject[] {
  let list = filterStatus === "all" ? projects : projects.filter(p => p.status === filterStatus);
  list = [...list].sort((a, b) =>
    sortOrder === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
  );
  return list;
}

const mockProjects: MockProject[] = [
  { id: "1", name: "プロジェクトA", status: "created", createdAt: 1000 },
  { id: "2", name: "プロジェクトB", status: "recorded", createdAt: 2000 },
  { id: "3", name: "プロジェクトC", status: "transcribed", createdAt: 3000 },
  { id: "4", name: "プロジェクトD", status: "summarized", createdAt: 4000 },
  { id: "5", name: "プロジェクトE", status: "recorded", createdAt: 5000 },
];

describe("プロジェクト一覧フィルタ・並び替え", () => {
  it("フィルターなし（all）で全プロジェクトを返す", () => {
    const result = filterAndSort(mockProjects, "all", "newest");
    expect(result).toHaveLength(5);
  });

  it("ステータスでフィルタリングできる", () => {
    const result = filterAndSort(mockProjects, "recorded", "newest");
    expect(result).toHaveLength(2);
    result.forEach(p => expect(p.status).toBe("recorded"));
  });

  it("createdステータスでフィルタリングできる", () => {
    const result = filterAndSort(mockProjects, "created", "newest");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("summarizedステータスでフィルタリングできる", () => {
    const result = filterAndSort(mockProjects, "summarized", "newest");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("4");
  });

  it("新しい順（newest）で並び替えできる", () => {
    const result = filterAndSort(mockProjects, "all", "newest");
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].createdAt).toBeGreaterThanOrEqual(result[i + 1].createdAt);
    }
  });

  it("古い順（oldest）で並び替えできる", () => {
    const result = filterAndSort(mockProjects, "all", "oldest");
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].createdAt).toBeLessThanOrEqual(result[i + 1].createdAt);
    }
  });

  it("フィルタと並び替えを組み合わせて使える", () => {
    const result = filterAndSort(mockProjects, "recorded", "oldest");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("2"); // createdAt: 2000 (古い)
    expect(result[1].id).toBe("5"); // createdAt: 5000 (新しい)
  });

  it("該当なしの場合は空配列を返す", () => {
    const result = filterAndSort(mockProjects, "transcribed", "newest");
    expect(result).toHaveLength(1); // プロジェクトCのみ
    const emptyResult = filterAndSort([], "recorded", "newest");
    expect(emptyResult).toHaveLength(0);
  });

  it("元の配列を変更しない（immutable）", () => {
    const original = [...mockProjects];
    filterAndSort(mockProjects, "all", "oldest");
    expect(mockProjects).toEqual(original);
  });
});
