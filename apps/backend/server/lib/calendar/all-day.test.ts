import { describe, expect, test } from "bun:test";
import { allDayRange, calendarDate, eventTime, spanDays, wallDate } from "./all-day";
import { zonedDateToInstant } from "./google/zoned-date";

const day = (range: { start: Date; end: Date }) => [calendarDate(range.start), calendarDate(range.end)];

describe("allDayRange", () => {
  test("a date-time east of UTC keeps its own written date, not the UTC one", () => {
    expect(day(allDayRange("2026-11-23T00:00:00+01:00", undefined))).toEqual(["2026-11-23", "2026-11-24"]);
  });

  test("a date-time west of UTC late in the evening keeps its written date", () => {
    expect(day(allDayRange("2026-11-23T22:30:00-08:00", undefined))).toEqual(["2026-11-23", "2026-11-24"]);
  });

  test("a bare date is that day", () => {
    expect(day(allDayRange("2026-11-23", undefined))).toEqual(["2026-11-23", "2026-11-24"]);
  });

  test("a naked local date-time is its written date", () => {
    expect(day(allDayRange("2026-11-23T09:00", undefined))).toEqual(["2026-11-23", "2026-11-24"]);
  });

  test("a midnight end is exclusive, in any offset", () => {
    expect(day(allDayRange("2026-11-23T00:00:00+01:00", "2026-11-25T00:00:00+01:00"))).toEqual([
      "2026-11-23",
      "2026-11-25",
    ]);
  });

  test("an end with a time of day includes that day", () => {
    expect(day(allDayRange("2026-11-23", "2026-11-24T23:59:59+01:00"))).toEqual(["2026-11-23", "2026-11-25"]);
  });

  test("an end on the start day means that one day", () => {
    expect(day(allDayRange("2026-11-23", "2026-11-23"))).toEqual(["2026-11-23", "2026-11-24"]);
  });

  test("a length carries over when only the start moves", () => {
    expect(day(allDayRange("2026-11-30", undefined, 3))).toEqual(["2026-11-30", "2026-12-03"]);
  });

  test("an end before the start is refused", () => {
    expect(() => allDayRange("2026-11-23", "2026-11-21")).toThrow("end must be after start");
  });

  test("a date that does not exist is refused rather than rolled over", () => {
    expect(() => wallDate("2026-02-30", "start")).toThrow("not a real date");
  });

  test("words are refused", () => {
    expect(() => wallDate("next monday", "start")).toThrow("must be a date");
    expect(() => wallDate("2026-11-23Tnope", "start")).toThrow("must be a date");
  });
});

describe("calendarDate", () => {
  test("midnight UTC is its own date", () => {
    expect(calendarDate(new Date("2026-11-23T00:00:00Z"))).toBe("2026-11-23");
  });

  test("a date read back from a Prague calendar is not a day early", () => {
    expect(calendarDate(zonedDateToInstant("2026-11-23", "Europe/Prague"))).toBe("2026-11-23");
  });

  test("a date read back from a Los Angeles calendar is not a day late", () => {
    expect(calendarDate(zonedDateToInstant("2026-11-23", "America/Los_Angeles"))).toBe("2026-11-23");
  });

  test("a date read back from Auckland in summer time survives, given the calendar's zone", () => {
    expect(calendarDate(zonedDateToInstant("2026-12-25", "Pacific/Auckland"), "Pacific/Auckland")).toBe("2026-12-25");
  });

  test("a date read back from Kiritimati, fourteen hours ahead, survives given its zone", () => {
    expect(calendarDate(zonedDateToInstant("2026-11-23", "Pacific/Kiritimati"), "Pacific/Kiritimati")).toBe(
      "2026-11-23",
    );
  });

  test("a date made here as midnight UTC stays its date in any calendar's zone", () => {
    expect(calendarDate(new Date("2026-11-23T00:00:00Z"), "America/Los_Angeles")).toBe("2026-11-23");
    expect(calendarDate(new Date("2026-11-23T00:00:00Z"), "Pacific/Kiritimati")).toBe("2026-11-23");
  });
});

describe("spanDays", () => {
  test("a DST change inside a multi-day event still counts whole days", () => {
    const start = zonedDateToInstant("2026-10-24", "Europe/Prague");
    const end = zonedDateToInstant("2026-10-27", "Europe/Prague");
    expect(spanDays(start, end)).toBe(3);
  });

  test("never less than one", () => {
    const at = new Date("2026-11-23T00:00:00Z");
    expect(spanDays(at, at)).toBe(1);
  });
});

describe("eventTime", () => {
  test("an all-day move is written as dates, from date-only or date-time input alike", () => {
    for (const given of ["2026-11-24", "2026-11-24T00:00:00+01:00", "2026-11-24T15:00:00-05:00"]) {
      const { start, end } = allDayRange(given, undefined);
      expect(eventTime(start, true)).toEqual({ date: "2026-11-24", dateTime: null });
      expect(eventTime(end, true)).toEqual({ date: "2026-11-25", dateTime: null });
    }
  });

  test("a timed event is written as an instant in its zone", () => {
    const at = new Date("2026-11-24T09:00:00Z");
    expect(eventTime(at, false, { timeZone: "Europe/Prague" })).toEqual({
      dateTime: "2026-11-24T09:00:00.000Z",
      timeZone: "Europe/Prague",
    });
  });
});
