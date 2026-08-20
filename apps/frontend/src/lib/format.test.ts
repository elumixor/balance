import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatClock,
  formatDateInput,
  formatDayDate,
  formatDayHeading,
  formatHoursAndMinutes,
  formatHoursDecimal,
  parseDateAndClock,
} from "./format";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatHoursAndMinutes", () => {
  it("says hours, minutes or both, never a zero half", () => {
    expect(formatHoursAndMinutes(0)).toBe("0m");
    expect(formatHoursAndMinutes(0.5)).toBe("30m");
    expect(formatHoursAndMinutes(1)).toBe("1h");
    expect(formatHoursAndMinutes(1.5)).toBe("1h 30m");
    expect(formatHoursAndMinutes(24)).toBe("24h");
  });

  it("keeps the sign of a real shortfall", () => {
    expect(formatHoursAndMinutes(-1.5)).toBe("-1h 30m");
    expect(formatHoursAndMinutes(-0.25)).toBe("-15m");
  });

  it("never signs a difference that rounds away to nothing", () => {
    // A meter a few seconds under target must not read "-0m", which says the opposite of "met".
    expect(formatHoursAndMinutes(-0.001)).toBe("0m");
    expect(formatHoursAndMinutes(-0)).toBe("0m");
  });

  it("rounds to the nearest minute rather than truncating", () => {
    expect(formatHoursAndMinutes(1 / 60 - 0.0001)).toBe("1m");
    expect(formatHoursAndMinutes(59.6 / 60)).toBe("1h");
  });
});

describe("formatHoursDecimal", () => {
  it("trims a whole number and keeps one decimal otherwise", () => {
    expect(formatHoursDecimal(12)).toBe("12h");
    expect(formatHoursDecimal(11.5)).toBe("11.5h");
    expect(formatHoursDecimal(11.46)).toBe("11.5h");
    expect(formatHoursDecimal(11.04)).toBe("11h");
  });

  it("signs a shortfall, but not one that rounds to nothing", () => {
    expect(formatHoursDecimal(-2.5)).toBe("-2.5h");
    expect(formatHoursDecimal(-0.01)).toBe("0h");
  });
});

describe("formatClock and formatDateInput", () => {
  it("pads both halves", () => {
    expect(formatClock(new Date(2026, 0, 2, 9, 5))).toBe("09:05");
    expect(formatDateInput(new Date(2026, 0, 2))).toBe("2026-01-02");
  });

  it("round-trips through the parser", () => {
    const date = new Date(2026, 7, 14, 14, 5);
    const parsed = parseDateAndClock(formatDateInput(date), formatClock(date));
    expect(parsed?.getTime()).toBe(date.getTime());
  });
});

describe("formatDayDate", () => {
  it("has no punctuation left in it", () => {
    expect(formatDayDate(new Date(2026, 7, 14))).not.toContain(",");
  });
});

describe("formatDayHeading", () => {
  it("names today and yesterday, and dates anything else", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 9, 0));
    expect(formatDayHeading(new Date(2026, 7, 14, 23, 59))).toBe("Today");
    expect(formatDayHeading(new Date(2026, 7, 13, 0, 1))).toBe("Yesterday");
    expect(formatDayHeading(new Date(2026, 7, 12))).not.toMatch(/Today|Yesterday/);
  });

  it("still says yesterday on the morning the clocks changed", () => {
    // 2026-10-25 is 25 hours long in Europe/Amsterdam: subtracting 86,400,000ms from the 26th
    // lands on the 25th at 01:00, which is still the day before.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 9, 0));
    expect(formatDayHeading(new Date(2026, 9, 25, 14, 0))).toBe("Yesterday");
  });
});

describe("parseDateAndClock", () => {
  it("takes the shapes the fields produce, spaces and all", () => {
    expect(parseDateAndClock(" 2026-08-14 ", " 9:05 ")?.getHours()).toBe(9);
    expect(parseDateAndClock("2026-08-14", "09:05")?.getMinutes()).toBe(5);
  });

  it("refuses anything else rather than guessing", () => {
    expect(parseDateAndClock("", "09:00")).toBeNull();
    expect(parseDateAndClock("2026-8-14", "09:00")).toBeNull();
    expect(parseDateAndClock("14/08/2026", "09:00")).toBeNull();
    expect(parseDateAndClock("2026-08-14", "9")).toBeNull();
    expect(parseDateAndClock("2026-08-14", "09:5")).toBeNull();
    expect(parseDateAndClock("2026-08-14", "0900")).toBeNull();
  });

  it("refuses a date that doesn't exist instead of rolling it into the next month", () => {
    // A February 31st that silently becomes March 3rd moves an event a week away from where the
    // person typed it, and the editor's own error message never fires.
    expect(parseDateAndClock("2026-02-31", "09:00")).toBeNull();
    expect(parseDateAndClock("2026-13-01", "09:00")).toBeNull();
    expect(parseDateAndClock("2026-00-10", "09:00")).toBeNull();
  });

  it("refuses a time that doesn't exist", () => {
    expect(parseDateAndClock("2026-08-14", "25:00")).toBeNull();
    expect(parseDateAndClock("2026-08-14", "09:60")).toBeNull();
  });

  it("keeps the leap day it should", () => {
    expect(parseDateAndClock("2024-02-29", "09:00")?.getDate()).toBe(29);
  });
});
