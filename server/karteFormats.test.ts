import { describe, it, expect } from "vitest";
import { KARTE_FORMATS, getKarteFormat, DEFAULT_KARTE_FORMAT_ID } from "../shared/karteFormats";

describe("karteFormats", () => {
  it("should have at least 6 formats", () => {
    expect(KARTE_FORMATS.length).toBeGreaterThanOrEqual(6);
  });

  it("should return default format for unknown id", () => {
    const format = getKarteFormat("unknown_id");
    expect(format.id).toBe(DEFAULT_KARTE_FORMAT_ID);
  });

  it("should return dental hygiene format", () => {
    const format = getKarteFormat("dental_hygiene");
    expect(format.id).toBe("dental_hygiene");
    expect(format.name).toContain("歯科衛生");
  });

  it("should return orthopedics format", () => {
    const format = getKarteFormat("orthopedics");
    expect(format.id).toBe("orthopedics");
    expect(format.name).toContain("整形外科");
  });

  it("should generate output template with patient info", () => {
    const format = getKarteFormat("soap");
    const template = format.outputTemplate({
      patientId: "P001",
      patientName: "山田太郎",
      age: "45歳",
      gender: "男性",
    });
    expect(template).toContain("P001");
    expect(template).toContain("山田太郎");
    expect(template).toContain("45歳");
    expect(template).toContain("男性");
  });

  it("should generate output template with empty patient info", () => {
    const format = getKarteFormat("dental_hygiene");
    const template = format.outputTemplate({});
    expect(template).toContain("（情報なし）");
  });

  it("should generate chunk prompt for single chunk", () => {
    const format = getKarteFormat("orthopedics");
    const template = format.outputTemplate();
    const prompt = format.chunkPrompt("テスト書き起こし", 1, 1, template);
    expect(prompt).toContain("テスト書き起こし");
    expect(prompt).toContain("整形外科");
  });

  it("should generate chunk prompt for multiple chunks", () => {
    const format = getKarteFormat("soap");
    const template = format.outputTemplate();
    const prompt = format.chunkPrompt("テスト書き起こし", 2, 3, template);
    expect(prompt).toContain("第2部");
    expect(prompt).toContain("全3部");
  });

  it("should generate merge prompt", () => {
    const format = getKarteFormat("internal_medicine");
    const template = format.outputTemplate();
    const prompt = format.mergePrompt(["パート1の情報", "パート2の情報"], template);
    expect(prompt).toContain("パート1の情報");
    expect(prompt).toContain("パート2の情報");
  });

  it("all formats should have required fields", () => {
    for (const format of KARTE_FORMATS) {
      expect(format.id).toBeTruthy();
      expect(format.name).toBeTruthy();
      expect(format.category).toBeTruthy();
      expect(format.description).toBeTruthy();
      expect(format.systemPrompt).toBeTruthy();
      expect(typeof format.outputTemplate).toBe("function");
      expect(typeof format.chunkPrompt).toBe("function");
      expect(typeof format.mergePrompt).toBe("function");
    }
  });
});
