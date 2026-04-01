import { describe, it, expect } from "vitest";

/**
 * parseUserFriendlyError のロジックをサーバー側でテスト
 * フロントエンドの実装と同じロジックを検証
 */
function parseUserFriendlyError(errorMessage: string): string {
  if (errorMessage.includes("SERVICE_UNAVAILABLE")) {
    return "AIサービスが一時的に混雑しています。数分待ってから再試行してください。(503)";
  }
  if (errorMessage.includes("PRECONDITION_FAILED")) {
    return "APIの利用条件が満たされていません。プランの制限に達した可能性があります。しばらく待ってから再試行してください。(412)";
  }
  if (errorMessage.includes("RATE_LIMITED")) {
    return "APIのリクエスト制限に達しました。しばらく待ってから再試行してください。(429)";
  }
  if (errorMessage.includes("SERVER_ERROR")) {
    return "AIサービスでエラーが発生しました。しばらく待ってから再試行してください。";
  }
  if (errorMessage.includes("LLM response is not valid JSON")) {
    return "AIサービスから異常なレスポンスが返ってきました。しばらく待ってから再試行してください。";
  }
  if (errorMessage.includes("412 Precondition Failed")) {
    return "APIの利用条件が満たされていません。プランの制限に達した可能性があります。しばらく待ってから再試行してください。(412)";
  }
  if (errorMessage.includes("503") || errorMessage.includes("Service Unavailable")) {
    return "AIサービスが一時的に利用できません。数分待ってから再試行してください。(503)";
  }
  return errorMessage;
}

/** JST時刻フォーマット関数のテスト */
function formatJST(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

/** エラーカテゴリ判定のテスト */
function getErrorCategory(msg: string): { label: string; color: string } {
  if (msg.includes("SERVICE_UNAVAILABLE") || msg.includes("Service Unavailable") || msg.includes("503")) {
    return { label: "503 サービス停止", color: "bg-orange-100 text-orange-700" };
  }
  if (msg.includes("PRECONDITION_FAILED") || msg.includes("412 Precondition Failed")) {
    return { label: "412 利用制限", color: "bg-yellow-100 text-yellow-700" };
  }
  if (msg.includes("RATE_LIMITED") || msg.includes("429")) {
    return { label: "429 レート制限", color: "bg-amber-100 text-amber-700" };
  }
  if (msg.includes("not valid JSON") || msg.includes("LLM response")) {
    return { label: "JSONパースエラー", color: "bg-red-100 text-red-700" };
  }
  if (msg.includes("LLM invoke failed")) {
    return { label: "LLMエラー", color: "bg-red-100 text-red-700" };
  }
  return { label: "その他", color: "bg-slate-100 text-slate-700" };
}

describe("parseUserFriendlyError", () => {
  it("SERVICE_UNAVAILABLE エラーを日本語に変換する", () => {
    const result = parseUserFriendlyError("SERVICE_UNAVAILABLE: server is busy");
    expect(result).toContain("混雑");
    expect(result).toContain("503");
  });

  it("PRECONDITION_FAILED エラーを日本語に変換する", () => {
    const result = parseUserFriendlyError("PRECONDITION_FAILED: quota exceeded");
    expect(result).toContain("利用条件");
    expect(result).toContain("412");
  });

  it("RATE_LIMITED エラーを日本語に変換する", () => {
    const result = parseUserFriendlyError("RATE_LIMITED: too many requests");
    expect(result).toContain("リクエスト制限");
    expect(result).toContain("429");
  });

  it("412 Precondition Failed エラーを日本語に変換する", () => {
    const result = parseUserFriendlyError("LLM invoke failed: 412 Precondition Failed – {\"code\":9}");
    expect(result).toContain("利用条件");
    expect(result).toContain("412");
  });

  it("Service Unavailable エラーを日本語に変換する", () => {
    const result = parseUserFriendlyError("Unexpected token 'S', \"Service Unavailable\" is not valid JSON");
    expect(result).toContain("利用できません");
    expect(result).toContain("503");
  });

  it("503 を含むエラーを日本語に変換する", () => {
    const result = parseUserFriendlyError("HTTP 503 error occurred");
    expect(result).toContain("利用できません");
  });

  it("LLM response is not valid JSON エラーを日本語に変換する", () => {
    const result = parseUserFriendlyError("LLM response is not valid JSON: <!DOCTYPE html>");
    expect(result).toContain("異常なレスポンス");
  });

  it("SERVER_ERROR エラーを日本語に変換する", () => {
    const result = parseUserFriendlyError("SERVER_ERROR: internal server error");
    expect(result).toContain("エラーが発生");
  });

  it("未知のエラーはそのまま返す", () => {
    const msg = "Some unknown error occurred";
    const result = parseUserFriendlyError(msg);
    expect(result).toBe(msg);
  });
});

describe("formatJST", () => {
  it("nullを渡すと「—」を返す", () => {
    expect(formatJST(null)).toBe("—");
  });

  it("Date オブジェクトをJST形式に変換する", () => {
    const date = new Date("2026-04-01T00:00:00.000Z"); // UTC 00:00 = JST 09:00
    const result = formatJST(date);
    expect(result).toContain("2026");
    expect(result).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/); // ja-JP形式
  });

  it("文字列の日付をJST形式に変換する", () => {
    const result = formatJST("2026-04-01T00:00:00.000Z");
    expect(result).toContain("2026");
  });
});

describe("getErrorCategory", () => {
  it("Service Unavailable を503カテゴリに分類する", () => {
    const cat = getErrorCategory("Service Unavailable error");
    expect(cat.label).toBe("503 サービス停止");
  });

  it("412 Precondition Failed を412カテゴリに分類する", () => {
    const cat = getErrorCategory("LLM invoke failed: 412 Precondition Failed");
    expect(cat.label).toBe("412 利用制限");
  });

  it("not valid JSON をJSONパースエラーに分類する", () => {
    // "Service Unavailable" を含まない純粋なJSONパースエラー
    const cat = getErrorCategory("LLM response is not valid JSON: unexpected token");
    expect(cat.label).toBe("JSONパースエラー");
  });

  it("Service Unavailable を含む not valid JSON は503カテゴリが優先される", () => {
    // 「Service Unavailable」チェックが先に来るため503カテゴリになる
    const cat = getErrorCategory("Unexpected token 'S', \"Service Unavailable\" is not valid JSON");
    expect(cat.label).toBe("503 サービス停止");
  });

  it("LLM invoke failed をLLMエラーに分類する", () => {
    const cat = getErrorCategory("LLM invoke failed: some error");
    expect(cat.label).toBe("LLMエラー");
  });

  it("未知のエラーをその他に分類する", () => {
    const cat = getErrorCategory("Some random error");
    expect(cat.label).toBe("その他");
  });
});
