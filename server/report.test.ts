import { describe, it, expect, vi, beforeEach } from "vitest";

// DB モックを先に設定
vi.mock("./db", () => ({
  createErrorReport: vi.fn().mockResolvedValue(undefined),
  getErrorReports: vi.fn().mockResolvedValue([
    {
      report: {
        id: 1,
        userId: 10,
        appName: "voice",
        operation: "transcribe",
        errorMessage: "Network error",
        context: '{"duration":900}',
        userComment: "15分の音声で失敗しました",
        createdAt: new Date("2026-03-05T00:00:00Z"),
      },
      userName: "テストユーザー",
      userEmail: "test@example.com",
    },
  ]),
}));

import { createErrorReport, getErrorReports } from "./db";

describe("Error Report DB helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createErrorReport が正しい引数で呼ばれる", async () => {
    const report = {
      userId: 10,
      appName: "voice",
      operation: "transcribe",
      errorMessage: "Network error",
      context: '{"duration":900}',
      userComment: "15分の音声で失敗しました",
      userAgent: null,
    };
    await createErrorReport(report);
    expect(createErrorReport).toHaveBeenCalledWith(report);
  });

  it("getErrorReports がレポート一覧を返す", async () => {
    const reports = await getErrorReports(100);
    expect(reports).toHaveLength(1);
    expect(reports[0].report.appName).toBe("voice");
    expect(reports[0].report.operation).toBe("transcribe");
    expect(reports[0].userName).toBe("テストユーザー");
  });

  it("createErrorReport がコメントなしでも動作する", async () => {
    const report = {
      userId: 5,
      appName: "voice",
      operation: "summarize",
      errorMessage: "Timeout",
      context: null,
      userComment: null,
      userAgent: null,
    };
    await createErrorReport(report);
    expect(createErrorReport).toHaveBeenCalledWith(report);
  });

  it("getErrorReports が limit を受け取る", async () => {
    await getErrorReports(50);
    expect(getErrorReports).toHaveBeenCalledWith(50);
  });
});
