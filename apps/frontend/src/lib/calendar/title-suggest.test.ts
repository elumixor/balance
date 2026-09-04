import { describe, expect, it } from "vitest";
import { matchTrailing, parseClock, parseDuration, parseWhen, suggest } from "./title-suggest";

// A Friday.
const now = new Date(2026, 8, 4, 10, 0);

describe("parseDuration", () => {
  it("reads hours, minutes, and both, however they are written", () => {
    expect(parseDuration("1h")).toBe(60);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("1,5 hours")).toBe(90);
    expect(parseDuration("2 hrs")).toBe(120);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("45 min")).toBe(45);
    expect(parseDuration("5 minutes")).toBe(5);
  });

  it("is not a time or a word", () => {
    expect(parseDuration("13:30")).toBeNull();
    expect(parseDuration("hour")).toBeNull();
    expect(parseDuration("1x")).toBeNull();
  });
});

describe("parseClock", () => {
  it("reads 24-hour and 12-hour clocks", () => {
    expect(parseClock("13:30")).toEqual({ clock: "13:30", explicit: true });
    expect(parseClock("9")).toEqual({ clock: "09:00", explicit: false });
    expect(parseClock("9am")).toEqual({ clock: "09:00", explicit: true });
    expect(parseClock("9:15PM")).toEqual({ clock: "21:15", explicit: true });
    expect(parseClock("12am")).toEqual({ clock: "00:00", explicit: true });
    expect(parseClock("12pm")).toEqual({ clock: "12:00", explicit: true });
  });

  it("refuses what no clock shows", () => {
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("13:60")).toBeNull();
    expect(parseClock("13pm")).toBeNull();
    expect(parseClock("0am")).toBeNull();
    expect(parseClock("noon")).toBeNull();
  });
});

describe("parseWhen", () => {
  const at = (words: string) => parseWhen(words.split(" "), now);

  it("names the days around today", () => {
    expect(at("today")).toMatchObject({ date: "2026-09-04" });
    expect(at("tod")).toMatchObject({ date: "2026-09-04" });
    expect(at("tomorrow")).toMatchObject({ date: "2026-09-05" });
    expect(at("tmr")).toMatchObject({ date: "2026-09-05" });
    expect(at("yesterday")).toMatchObject({ date: "2026-09-03" });
  });

  it("takes a weekday as the coming one, never today", () => {
    expect(at("tuesday")).toMatchObject({ date: "2026-09-08" });
    expect(at("tue")).toMatchObject({ date: "2026-09-08" });
    expect(at("friday")).toMatchObject({ date: "2026-09-11" });
    expect(at("mo")).toBeNull();
  });

  it("takes next as the one after that", () => {
    expect(at("next tuesday")).toMatchObject({ date: "2026-09-15" });
    expect(at("next friday")).toMatchObject({ date: "2026-09-18" });
    expect(at("next week")).toMatchObject({ date: "2026-09-11" });
    expect(at("next")).toBeNull();
    expect(at("next year")).toBeNull();
  });

  it("reads a date day-first, this year unless told, two digits as this century", () => {
    expect(at("14.10")).toMatchObject({ date: "2026-10-14" });
    expect(at("14/10")).toMatchObject({ date: "2026-10-14" });
    expect(at("14.10.27")).toMatchObject({ date: "2027-10-14" });
    expect(at("14.10.2027")).toMatchObject({ date: "2027-10-14" });
    expect(at("2027-10-14")).toMatchObject({ date: "2027-10-14" });
    expect(at("31.02")).toBeNull();
    expect(at("2027-02-31")).toBeNull();
  });

  it("reads a time, a span, and a span with room around the dash", () => {
    expect(at("13:30")).toEqual({ date: null, start: "13:30", end: null, explicit: true });
    expect(at("13:30-14:30")).toEqual({ date: null, start: "13:30", end: "14:30", explicit: true });
    expect(at("13:30 - 14:30")).toEqual({ date: null, start: "13:30", end: "14:30", explicit: true });
    expect(at("13:30 –14:30")).toMatchObject({ start: "13:30", end: "14:30" });
    expect(at("9-10")).toEqual({ date: null, start: "09:00", end: "10:00", explicit: false });
    expect(at("9-10am")).toEqual({ date: null, start: "09:00", end: "10:00", explicit: true });
    expect(at("9pm-10")).toEqual({ date: null, start: "21:00", end: "10:00", explicit: true });
  });

  it("puts a day and a time together, in either order, with the small words", () => {
    expect(at("next tuesday at 9am")).toMatchObject({ date: "2026-09-15", start: "09:00" });
    expect(at("14:00 on 14.10")).toMatchObject({ date: "2026-10-14", start: "14:00" });
    expect(at("tomorrow 13:30-14:30")).toMatchObject({ date: "2026-09-05", start: "13:30", end: "14:30" });
  });

  it("means nothing with a word it can't read, two starts, or nothing at all", () => {
    expect(at("meeting tomorrow")).toBeNull();
    expect(at("13:30 14:30")).toBeNull();
    expect(at("13:30-")).toBeNull();
    expect(at("25-10")).toBeNull();
    expect(at("9-x")).toBeNull();
    expect(at("at")).toBeNull();
  });
});

describe("matchTrailing", () => {
  const start = (before: string) => matchTrailing(before, now);

  it("finds where the day or time at the end of the line begins", () => {
    expect(start("Call mom tomorrow")).toBe(9);
    expect(start("Gym next tuesday at 9am")).toBe(4);
    expect(start("Sync 13:30 - 14:30")).toBe(5);
    expect(start("Review 14.10.27")).toBe(7);
  });

  it("finds a length", () => {
    expect(start("Run 1h")).toBe(4);
    expect(start("Run 1 h")).toBe(4);
    expect(start("Run 45min")).toBe(4);
  });

  it("leaves a bare number, a bare hour, and plain words alone", () => {
    expect(start("Chapter 9")).toBeNull();
    expect(start("Chapter 9-10")).toBeNull();
    expect(start("Deep work")).toBeNull();
    expect(start("")).toBeNull();
    expect(start("   ")).toBeNull();
  });

  it("only looks back a few words", () => {
    expect(start("a b c d e tomorrow")).toBe(10);
    expect(start("next tuesday at 9am")).toBe(0);
    expect(start("on next tuesday at 9am")).toBe(3);
  });
});

describe("suggest", () => {
  it("offers the days and lengths people reach for when nothing is typed", () => {
    expect(suggest("", now).map((s) => s.label)).toEqual(["Today", "Tomorrow", "30m", "1h"]);
    expect(suggest("", now)[1].token).toBe("@when:2026-09-05");
  });

  it("offers a length, a day, a time, or a span for what was typed", () => {
    expect(suggest("1h30", now)).toEqual([{ kind: "dur", token: "@dur:90", label: "1h 30m", detail: "Length" }]);
    expect(suggest("tomorrow", now)).toEqual([
      { kind: "when", token: "@when:2026-09-05", label: "Tomorrow", detail: "Day" },
    ]);
    expect(suggest("13:30", now)).toEqual([{ kind: "when", token: "@when:13:30", label: "13:30", detail: "Start" }]);
    expect(suggest("13:30-14:30", now)).toEqual([
      { kind: "when", token: "@when:13:30-14:30", label: "13:30 – 14:30", detail: "Span" },
    ]);
    expect(suggest("tomorrow 9am", now)).toEqual([
      { kind: "when", token: "@when:2026-09-05T09:00", label: "Tomorrow, 09:00", detail: "Day and time" },
    ]);
  });

  it("offers nothing for a name, or for no time at all", () => {
    expect(suggest("groceries", now)).toEqual([]);
    expect(suggest("0m", now)).toEqual([]);
  });
});
