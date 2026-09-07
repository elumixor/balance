import { describe, expect, test } from "bun:test";
import { isSeriesStart, remainingRule, splitPointOf, truncateRule } from "./series-split";

describe("splitPointOf", () => {
  test("reads a timed occurrence's original start off its id", () => {
    const point = splitPointOf("abc123_20260907T090000Z", new Date("2000-01-01T00:00:00Z"));
    expect(point).toEqual({
      kind: "instant",
      at: new Date("2026-09-07T09:00:00Z"),
    });
  });

  test("reads an all-day occurrence as a date", () => {
    expect(splitPointOf("abc123_20260907", new Date())).toEqual({
      kind: "date",
      day: "20260907",
    });
  });

  test("falls back to what the caller saw when the id carries nothing", () => {
    const seen = new Date("2026-09-07T10:30:00Z");
    expect(splitPointOf("abc123", seen)).toEqual({ kind: "instant", at: seen });
  });

  test("falls back on an id whose suffix is not a real time", () => {
    const seen = new Date("2026-09-07T10:30:00Z");
    expect(splitPointOf("abc_20261399T990000Z", seen)).toEqual({
      kind: "instant",
      at: seen,
    });
  });
});

describe("isSeriesStart", () => {
  const masterStart = new Date("2026-09-01T09:00:00Z");

  test("an occurrence at or before the master's start leaves nothing to keep", () => {
    expect(isSeriesStart({ kind: "instant", at: masterStart }, masterStart)).toBe(true);
    expect(isSeriesStart({ kind: "instant", at: new Date("2026-09-08T09:00:00Z") }, masterStart)).toBe(false);
  });

  test("compares an all-day split by day", () => {
    expect(isSeriesStart({ kind: "date", day: "20260901" }, masterStart)).toBe(true);
    expect(isSeriesStart({ kind: "date", day: "20260902" }, masterStart)).toBe(false);
  });
});

describe("truncateRule", () => {
  test("ends the rule one second before a timed split, dropping COUNT", () => {
    expect(
      truncateRule(["RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO"], {
        kind: "instant",
        at: new Date("2026-09-07T09:00:00Z"),
      }),
    ).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260907T085959Z"]);
  });

  test("replaces an UNTIL that was already there", () => {
    expect(
      truncateRule(["RRULE:FREQ=DAILY;UNTIL=20261231T235959Z"], {
        kind: "instant",
        at: new Date("2026-09-07T00:00:00Z"),
      }),
    ).toEqual(["RRULE:FREQ=DAILY;UNTIL=20260906T235959Z"]);
  });

  test("ends an all-day rule on the day before, crossing a month", () => {
    expect(truncateRule(["RRULE:FREQ=DAILY"], { kind: "date", day: "20260301" })).toEqual([
      "RRULE:FREQ=DAILY;UNTIL=20260228",
    ]);
  });

  test("leaves EXDATE lines alone", () => {
    expect(
      truncateRule(["EXDATE;TZID=Europe/Kyiv:20260903T090000", "RRULE:FREQ=DAILY"], { kind: "date", day: "20260910" }),
    ).toEqual(["EXDATE;TZID=Europe/Kyiv:20260903T090000", "RRULE:FREQ=DAILY;UNTIL=20260909"]);
  });
});

describe("remainingRule", () => {
  test("spends the occurrences that already happened", () => {
    expect(remainingRule(["RRULE:FREQ=WEEKLY;COUNT=10"], 3)).toEqual(["RRULE:FREQ=WEEKLY;COUNT=7"]);
  });

  test("never drops below one", () => {
    expect(remainingRule(["RRULE:FREQ=WEEKLY;COUNT=2"], 5)).toEqual(["RRULE:FREQ=WEEKLY;COUNT=1"]);
  });

  test("leaves a rule without COUNT as it is", () => {
    expect(remainingRule(["RRULE:FREQ=DAILY;UNTIL=20261231T235959Z", "EXDATE:20260903T090000Z"], 4)).toEqual([
      "RRULE:FREQ=DAILY;UNTIL=20261231T235959Z",
      "EXDATE:20260903T090000Z",
    ]);
  });
});
