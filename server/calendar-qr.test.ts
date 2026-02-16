import { describe, it, expect } from "vitest";

/**
 * CalendarQR App - Unit Tests
 * 
 * このアプリはクライアントサイドのみ（LocalStorage + QRCode生成）で
 * サーバーサイドのAPIは不要。ここではヘルパー関数のロジックをテストする。
 */

// ============ Helper Functions (from CalendarQRApp.tsx) ============
// テスト用にロジックを再実装

function generateId(): string {
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getTargetDate(daysFromToday: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(12, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatDateCompact(date: Date): string {
  return date.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
  });
}

interface ScheduleItem {
  id: string;
  name: string;
  calendarTitle: string;
  daysFromToday: number;
  memo: string;
  location: string;
}

function toGoogleCalendarUrl(item: ScheduleItem): string {
  const start = getTargetDate(item.daysFromToday);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

  const startUtc = new Date(start.getTime() - start.getTimezoneOffset() * 60000);
  const endUtc = new Date(end.getTime() - end.getTimezoneOffset() * 60000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: item.calendarTitle,
    dates: `${fmt(startUtc)}/${fmt(endUtc)}`,
    details: item.memo,
    location: item.location,
    ctz: "Asia/Tokyo",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toICalendarData(item: ScheduleItem): string {
  const start = getTargetDate(item.daysFromToday);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  const fmtLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${y}${m}${day}T${h}${min}${s}`;
  };

  const now = new Date();
  const uid = `${Date.now()}@calendar-qr`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CalendarQR//JP",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART;TZID=Asia/Tokyo:${fmtLocal(start)}`,
    `DTEND;TZID=Asia/Tokyo:${fmtLocal(end)}`,
    `DTSTAMP:${fmtLocal(now)}Z`,
    `UID:${uid}`,
    `SUMMARY:${item.calendarTitle}`,
    item.memo ? `DESCRIPTION:${item.memo.replace(/\n/g, "\\n")}` : "",
    item.location ? `LOCATION:${item.location}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return lines;
}

// ============ Tests ============

describe("CalendarQR - ID Generation", () => {
  it("should generate unique IDs", () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^schedule-\d+-[a-z0-9]+$/);
  });
});

describe("CalendarQR - Date Helpers", () => {
  it("should calculate target date correctly for 0 days", () => {
    const result = getTargetDate(0);
    const today = new Date();
    expect(result.getDate()).toBe(today.getDate());
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(0);
  });

  it("should calculate target date correctly for 30 days", () => {
    const result = getTargetDate(30);
    const expected = new Date();
    expected.setDate(expected.getDate() + 30);
    expect(result.getDate()).toBe(expected.getDate());
    expect(result.getMonth()).toBe(expected.getMonth());
    expect(result.getHours()).toBe(12);
  });

  it("should calculate target date correctly for 365 days", () => {
    const result = getTargetDate(365);
    const expected = new Date();
    expected.setDate(expected.getDate() + 365);
    expect(result.getDate()).toBe(expected.getDate());
    expect(result.getHours()).toBe(12);
  });

  it("should format date in Japanese locale", () => {
    const date = new Date(2026, 2, 18, 12, 0, 0); // March 18, 2026
    const formatted = formatDate(date);
    expect(formatted).toContain("2026");
    expect(formatted).toContain("3");
    expect(formatted).toContain("18");
  });

  it("should format compact date", () => {
    const date = new Date(2026, 2, 18, 12, 0, 0);
    const formatted = formatDateCompact(date);
    expect(formatted).toContain("3");
    expect(formatted).toContain("18");
  });
});

describe("CalendarQR - Google Calendar URL Generation", () => {
  const testItem: ScheduleItem = {
    id: "test-1",
    name: "トリミング",
    calendarTitle: "ペットのトリミング予約",
    daysFromToday: 30,
    memo: "シャンプー＆カットコース",
    location: "ペットサロン ABC",
  };

  it("should generate a valid Google Calendar URL", () => {
    const url = toGoogleCalendarUrl(testItem);
    expect(url).toContain("https://calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
  });

  it("should include the calendar title in the URL", () => {
    const url = toGoogleCalendarUrl(testItem);
    expect(url).toContain(encodeURIComponent("ペットのトリミング予約"));
  });

  it("should include the location in the URL", () => {
    const url = toGoogleCalendarUrl(testItem);
    // URLSearchParams encodes spaces as '+' instead of '%20'
    expect(url).toContain("location=");
    // Decode the URL to verify the location value
    const urlObj = new URL(url);
    expect(urlObj.searchParams.get("location")).toBe("ペットサロン ABC");
  });

  it("should include the memo as details", () => {
    const url = toGoogleCalendarUrl(testItem);
    expect(url).toContain(encodeURIComponent("シャンプー＆カットコース"));
  });

  it("should include timezone", () => {
    const url = toGoogleCalendarUrl(testItem);
    expect(url).toContain("ctz=Asia%2FTokyo");
  });

  it("should include date range in correct format", () => {
    const url = toGoogleCalendarUrl(testItem);
    // dates parameter should contain two dates separated by /
    expect(url).toMatch(/dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/);
  });
});

describe("CalendarQR - iCalendar Data Generation", () => {
  const testItem: ScheduleItem = {
    id: "test-2",
    name: "ワクチン接種",
    calendarTitle: "ワクチン接種",
    daysFromToday: 90,
    memo: "混合ワクチン（年1回）",
    location: "○○動物病院",
  };

  it("should generate valid iCalendar format", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toContain("BEGIN:VCALENDAR");
    expect(ical).toContain("END:VCALENDAR");
    expect(ical).toContain("BEGIN:VEVENT");
    expect(ical).toContain("END:VEVENT");
  });

  it("should include version and prodid", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toContain("VERSION:2.0");
    expect(ical).toContain("PRODID:-//CalendarQR//JP");
  });

  it("should include the event summary", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toContain("SUMMARY:ワクチン接種");
  });

  it("should include the location", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toContain("LOCATION:○○動物病院");
  });

  it("should include the description", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toContain("DESCRIPTION:混合ワクチン（年1回）");
  });

  it("should include timezone in DTSTART", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:");
  });

  it("should include timezone in DTEND", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toContain("DTEND;TZID=Asia/Tokyo:");
  });

  it("should have 1 hour duration", () => {
    const ical = toICalendarData(testItem);
    const startMatch = ical.match(/DTSTART;TZID=Asia\/Tokyo:(\d{8}T(\d{2})\d{4})/);
    const endMatch = ical.match(/DTEND;TZID=Asia\/Tokyo:(\d{8}T(\d{2})\d{4})/);
    expect(startMatch).not.toBeNull();
    expect(endMatch).not.toBeNull();
    if (startMatch && endMatch) {
      const startHour = parseInt(startMatch[2]);
      const endHour = parseInt(endMatch[2]);
      expect(endHour - startHour).toBe(1);
    }
  });

  it("should not include location when empty", () => {
    const itemNoLocation: ScheduleItem = {
      ...testItem,
      location: "",
    };
    const ical = toICalendarData(itemNoLocation);
    expect(ical).not.toContain("LOCATION:");
  });

  it("should not include description when empty", () => {
    const itemNoMemo: ScheduleItem = {
      ...testItem,
      memo: "",
    };
    const ical = toICalendarData(itemNoMemo);
    expect(ical).not.toContain("DESCRIPTION:");
  });

  it("should use CRLF line endings", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toContain("\r\n");
  });
});

describe("CalendarQR - Schedule Data Validation", () => {
  it("should handle schedule with all fields", () => {
    const item: ScheduleItem = {
      id: "test-full",
      name: "定期検診",
      calendarTitle: "定期健康診断",
      daysFromToday: 180,
      memo: "血液検査・レントゲン",
      location: "○○動物病院",
    };
    const url = toGoogleCalendarUrl(item);
    expect(url).toBeTruthy();
    const ical = toICalendarData(item);
    expect(ical).toBeTruthy();
  });

  it("should handle schedule with minimal fields", () => {
    const item: ScheduleItem = {
      id: "test-minimal",
      name: "テスト",
      calendarTitle: "テスト",
      daysFromToday: 1,
      memo: "",
      location: "",
    };
    const url = toGoogleCalendarUrl(item);
    expect(url).toContain("https://calendar.google.com/calendar/render");
    const ical = toICalendarData(item);
    expect(ical).toContain("BEGIN:VCALENDAR");
  });

  it("should handle schedule with special characters in memo", () => {
    const item: ScheduleItem = {
      id: "test-special",
      name: "テスト",
      calendarTitle: "テスト予定",
      daysFromToday: 7,
      memo: "行1\n行2\n行3",
      location: "東京都渋谷区",
    };
    const ical = toICalendarData(item);
    // newlines should be escaped in iCal format
    expect(ical).toContain("DESCRIPTION:行1\\n行2\\n行3");
  });

  it("should handle 0 days from today", () => {
    const item: ScheduleItem = {
      id: "test-today",
      name: "今日の予定",
      calendarTitle: "今日の予定",
      daysFromToday: 0,
      memo: "",
      location: "",
    };
    const url = toGoogleCalendarUrl(item);
    expect(url).toBeTruthy();
  });
});

describe("CalendarQR - Default Schedules", () => {
  const DEFAULT_SCHEDULES: ScheduleItem[] = [
    {
      id: "default-1",
      name: "トリミング",
      calendarTitle: "ペットのトリミング予約",
      daysFromToday: 30,
      memo: "シャンプー＆カットコース",
      location: "ペットサロン ABC",
    },
    {
      id: "default-2",
      name: "ワクチン接種",
      calendarTitle: "ワクチン接種",
      daysFromToday: 90,
      memo: "混合ワクチン（年1回）",
      location: "○○動物病院",
    },
    {
      id: "default-3",
      name: "定期検診",
      calendarTitle: "定期健康診断",
      daysFromToday: 180,
      memo: "血液検査・レントゲン",
      location: "○○動物病院",
    },
    {
      id: "default-4",
      name: "フィラリア予防",
      calendarTitle: "フィラリア予防薬投与",
      daysFromToday: 30,
      memo: "毎月1回投与",
      location: "",
    },
    {
      id: "default-5",
      name: "歯科クリーニング",
      calendarTitle: "ペット歯科クリーニング",
      daysFromToday: 365,
      memo: "年1回の歯石除去",
      location: "○○動物病院",
    },
  ];

  it("should have 5 default schedules", () => {
    expect(DEFAULT_SCHEDULES).toHaveLength(5);
  });

  it("should have unique IDs", () => {
    const ids = DEFAULT_SCHEDULES.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have all required fields", () => {
    DEFAULT_SCHEDULES.forEach((item) => {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.calendarTitle).toBeTruthy();
      expect(item.daysFromToday).toBeGreaterThanOrEqual(0);
    });
  });

  it("should generate valid Google Calendar URLs for all defaults", () => {
    DEFAULT_SCHEDULES.forEach((item) => {
      const url = toGoogleCalendarUrl(item);
      expect(url).toContain("https://calendar.google.com/calendar/render");
    });
  });

  it("should generate valid iCalendar data for all defaults", () => {
    DEFAULT_SCHEDULES.forEach((item) => {
      const ical = toICalendarData(item);
      expect(ical).toContain("BEGIN:VCALENDAR");
      expect(ical).toContain("END:VCALENDAR");
      expect(ical).toContain(`SUMMARY:${item.calendarTitle}`);
    });
  });
});
