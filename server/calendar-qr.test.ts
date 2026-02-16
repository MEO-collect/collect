import { describe, it, expect } from "vitest";

/**
 * CalendarQR App - Unit Tests
 *
 * このアプリはクライアントサイドのみ（LocalStorage + QRCode生成）で
 * サーバーサイドのAPIは不要。ここではヘルパー関数のロジックをテストする。
 */

// ============ Helper Functions (from CalendarQRApp.tsx) ============

function generateId(): string {
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function padTwo(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(hour: number, minute: number): string {
  return `${padTwo(hour)}:${padTwo(minute)}`;
}

function getTargetDateJST(
  daysFromToday: number,
  hour: number,
  minute: number
): { year: number; month: number; day: number; hour: number; minute: number } {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  jstNow.setDate(jstNow.getDate() + daysFromToday);
  return {
    year: jstNow.getFullYear(),
    month: jstNow.getMonth() + 1,
    day: jstNow.getDate(),
    hour,
    minute,
  };
}

function fmtJST(jst: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): string {
  return `${jst.year}${padTwo(jst.month)}${padTwo(jst.day)}T${padTwo(jst.hour)}${padTwo(jst.minute)}00`;
}

interface ScheduleItem {
  id: string;
  name: string;
  calendarTitle: string;
  daysFromToday: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  memo: string;
  location: string;
}

function toGoogleCalendarUrl(item: ScheduleItem): string {
  const startJST = getTargetDateJST(item.daysFromToday, item.startHour, item.startMinute);
  const endJST = getTargetDateJST(item.daysFromToday, item.endHour, item.endMinute);
  const dates = `${fmtJST(startJST)}/${fmtJST(endJST)}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: item.calendarTitle,
    dates,
    details: item.memo,
    location: item.location,
    ctz: "Asia/Tokyo",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toICalendarData(item: ScheduleItem): string {
  const startJST = getTargetDateJST(item.daysFromToday, item.startHour, item.startMinute);
  const endJST = getTargetDateJST(item.daysFromToday, item.endHour, item.endMinute);

  const now = new Date();
  const nowJST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const stampJST = {
    year: nowJST.getFullYear(),
    month: nowJST.getMonth() + 1,
    day: nowJST.getDate(),
    hour: nowJST.getHours(),
    minute: nowJST.getMinutes(),
  };

  const uid = `${Date.now()}@calendar-qr`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CalendarQR//JP",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART;TZID=Asia/Tokyo:${fmtJST(startJST)}`,
    `DTEND;TZID=Asia/Tokyo:${fmtJST(endJST)}`,
    `DTSTAMP:${fmtJST(stampJST)}Z`,
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

describe("CalendarQR - Time Formatting", () => {
  it("should pad single digit hours", () => {
    expect(formatTime(9, 0)).toBe("09:00");
  });

  it("should pad single digit minutes", () => {
    expect(formatTime(10, 5)).toBe("10:05");
  });

  it("should handle midnight", () => {
    expect(formatTime(0, 0)).toBe("00:00");
  });

  it("should handle 23:59", () => {
    expect(formatTime(23, 59)).toBe("23:59");
  });
});

describe("CalendarQR - JST Date Helpers", () => {
  it("should return correct hour and minute", () => {
    const result = getTargetDateJST(0, 14, 30);
    expect(result.hour).toBe(14);
    expect(result.minute).toBe(30);
  });

  it("should calculate future date correctly", () => {
    const today = getTargetDateJST(0, 10, 0);
    const future = getTargetDateJST(30, 10, 0);
    // The day should be different (approximately 30 days ahead)
    expect(future.year * 10000 + future.month * 100 + future.day).toBeGreaterThan(
      today.year * 10000 + today.month * 100 + today.day
    );
  });

  it("should format JST date correctly", () => {
    const jst = { year: 2026, month: 3, day: 18, hour: 10, minute: 30 };
    expect(fmtJST(jst)).toBe("20260318T103000");
  });

  it("should pad single digit month and day", () => {
    const jst = { year: 2026, month: 1, day: 5, hour: 9, minute: 0 };
    expect(fmtJST(jst)).toBe("20260105T090000");
  });
});

describe("CalendarQR - Google Calendar URL Generation", () => {
  const testItem: ScheduleItem = {
    id: "test-1",
    name: "トリミング",
    calendarTitle: "ペットのトリミング予約",
    daysFromToday: 30,
    startHour: 10,
    startMinute: 0,
    endHour: 11,
    endMinute: 0,
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

  it("should NOT include Z suffix in dates (local time format)", () => {
    const url = toGoogleCalendarUrl(testItem);
    // The dates should NOT end with Z - they should be local time
    const urlObj = new URL(url);
    const dates = urlObj.searchParams.get("dates") || "";
    expect(dates).not.toContain("Z");
  });

  it("should include correct start time in dates", () => {
    const url = toGoogleCalendarUrl(testItem);
    const urlObj = new URL(url);
    const dates = urlObj.searchParams.get("dates") || "";
    // Should contain T100000 for 10:00
    expect(dates).toContain("T100000/");
  });

  it("should include correct end time in dates", () => {
    const url = toGoogleCalendarUrl(testItem);
    const urlObj = new URL(url);
    const dates = urlObj.searchParams.get("dates") || "";
    // Should end with T110000 for 11:00
    expect(dates).toMatch(/T110000$/);
  });

  it("should handle custom time correctly", () => {
    const customItem: ScheduleItem = {
      ...testItem,
      startHour: 14,
      startMinute: 30,
      endHour: 16,
      endMinute: 0,
    };
    const url = toGoogleCalendarUrl(customItem);
    const urlObj = new URL(url);
    const dates = urlObj.searchParams.get("dates") || "";
    expect(dates).toContain("T143000/");
    expect(dates).toMatch(/T160000$/);
  });
});

describe("CalendarQR - iCalendar Data Generation", () => {
  const testItem: ScheduleItem = {
    id: "test-2",
    name: "ワクチン接種",
    calendarTitle: "ワクチン接種",
    daysFromToday: 90,
    startHour: 14,
    startMinute: 0,
    endHour: 15,
    endMinute: 0,
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

  it("should include correct start time (14:00)", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toMatch(/DTSTART;TZID=Asia\/Tokyo:\d{8}T140000/);
  });

  it("should include correct end time (15:00)", () => {
    const ical = toICalendarData(testItem);
    expect(ical).toMatch(/DTEND;TZID=Asia\/Tokyo:\d{8}T150000/);
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

  it("should handle custom time correctly", () => {
    const customItem: ScheduleItem = {
      ...testItem,
      startHour: 9,
      startMinute: 30,
      endHour: 12,
      endMinute: 45,
    };
    const ical = toICalendarData(customItem);
    expect(ical).toMatch(/DTSTART;TZID=Asia\/Tokyo:\d{8}T093000/);
    expect(ical).toMatch(/DTEND;TZID=Asia\/Tokyo:\d{8}T124500/);
  });
});

describe("CalendarQR - Schedule Data Validation", () => {
  it("should handle schedule with all fields", () => {
    const item: ScheduleItem = {
      id: "test-full",
      name: "定期検診",
      calendarTitle: "定期健康診断",
      daysFromToday: 180,
      startHour: 9,
      startMinute: 30,
      endHour: 11,
      endMinute: 0,
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
      startHour: 10,
      startMinute: 0,
      endHour: 11,
      endMinute: 0,
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
      startHour: 10,
      startMinute: 0,
      endHour: 11,
      endMinute: 0,
      memo: "行1\n行2\n行3",
      location: "東京都渋谷区",
    };
    const ical = toICalendarData(item);
    expect(ical).toContain("DESCRIPTION:行1\\n行2\\n行3");
  });

  it("should handle 0 days from today", () => {
    const item: ScheduleItem = {
      id: "test-today",
      name: "今日の予定",
      calendarTitle: "今日の予定",
      daysFromToday: 0,
      startHour: 15,
      startMinute: 0,
      endHour: 16,
      endMinute: 0,
      memo: "",
      location: "",
    };
    const url = toGoogleCalendarUrl(item);
    expect(url).toBeTruthy();
  });

  it("should handle early morning time", () => {
    const item: ScheduleItem = {
      id: "test-early",
      name: "早朝予定",
      calendarTitle: "早朝予定",
      daysFromToday: 1,
      startHour: 6,
      startMinute: 0,
      endHour: 7,
      endMinute: 30,
      memo: "",
      location: "",
    };
    const url = toGoogleCalendarUrl(item);
    const urlObj = new URL(url);
    const dates = urlObj.searchParams.get("dates") || "";
    expect(dates).toContain("T060000/");
    expect(dates).toMatch(/T073000$/);
  });

  it("should handle late evening time", () => {
    const item: ScheduleItem = {
      id: "test-late",
      name: "夜の予定",
      calendarTitle: "夜の予定",
      daysFromToday: 1,
      startHour: 21,
      startMinute: 0,
      endHour: 22,
      endMinute: 30,
      memo: "",
      location: "",
    };
    const url = toGoogleCalendarUrl(item);
    const urlObj = new URL(url);
    const dates = urlObj.searchParams.get("dates") || "";
    expect(dates).toContain("T210000/");
    expect(dates).toMatch(/T223000$/);
  });
});

describe("CalendarQR - Default Schedules", () => {
  const DEFAULT_SCHEDULES: ScheduleItem[] = [
    {
      id: "default-1",
      name: "トリミング",
      calendarTitle: "ペットのトリミング予約",
      daysFromToday: 30,
      startHour: 10,
      startMinute: 0,
      endHour: 11,
      endMinute: 0,
      memo: "シャンプー＆カットコース",
      location: "ペットサロン ABC",
    },
    {
      id: "default-2",
      name: "ワクチン接種",
      calendarTitle: "ワクチン接種",
      daysFromToday: 90,
      startHour: 14,
      startMinute: 0,
      endHour: 15,
      endMinute: 0,
      memo: "混合ワクチン（年1回）",
      location: "○○動物病院",
    },
    {
      id: "default-3",
      name: "定期検診",
      calendarTitle: "定期健康診断",
      daysFromToday: 180,
      startHour: 9,
      startMinute: 30,
      endHour: 11,
      endMinute: 0,
      memo: "血液検査・レントゲン",
      location: "○○動物病院",
    },
    {
      id: "default-4",
      name: "フィラリア予防",
      calendarTitle: "フィラリア予防薬投与",
      daysFromToday: 30,
      startHour: 10,
      startMinute: 0,
      endHour: 10,
      endMinute: 30,
      memo: "毎月1回投与",
      location: "",
    },
    {
      id: "default-5",
      name: "歯科クリーニング",
      calendarTitle: "ペット歯科クリーニング",
      daysFromToday: 365,
      startHour: 13,
      startMinute: 0,
      endHour: 15,
      endMinute: 0,
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

  it("should have all required fields including time", () => {
    DEFAULT_SCHEDULES.forEach((item) => {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.calendarTitle).toBeTruthy();
      expect(item.daysFromToday).toBeGreaterThanOrEqual(0);
      expect(item.startHour).toBeGreaterThanOrEqual(0);
      expect(item.startHour).toBeLessThanOrEqual(23);
      expect(item.endHour).toBeGreaterThanOrEqual(0);
      expect(item.endHour).toBeLessThanOrEqual(23);
      expect(item.startMinute).toBeGreaterThanOrEqual(0);
      expect(item.startMinute).toBeLessThanOrEqual(59);
      expect(item.endMinute).toBeGreaterThanOrEqual(0);
      expect(item.endMinute).toBeLessThanOrEqual(59);
    });
  });

  it("should have end time after start time for all defaults", () => {
    DEFAULT_SCHEDULES.forEach((item) => {
      const startTotal = item.startHour * 60 + item.startMinute;
      const endTotal = item.endHour * 60 + item.endMinute;
      expect(endTotal).toBeGreaterThan(startTotal);
    });
  });

  it("should generate valid Google Calendar URLs for all defaults", () => {
    DEFAULT_SCHEDULES.forEach((item) => {
      const url = toGoogleCalendarUrl(item);
      expect(url).toContain("https://calendar.google.com/calendar/render");
      // Verify no Z suffix in dates
      const urlObj = new URL(url);
      const dates = urlObj.searchParams.get("dates") || "";
      expect(dates).not.toContain("Z");
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
