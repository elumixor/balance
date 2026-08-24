import { describe, expect, it } from "bun:test";
import { addDays, dayIn, daysBetween, daysFrom, rangeOf, startOf, timeOn, weekdayOf, weekStartOf } from "./days";

const PRAGUE = "Europe/Prague";
const HOUR = 3_600_000;

describe("dayIn", () => {
  it("names the day the user is in, not the one UTC is in", () => {
    // 23:30 UTC on the 3rd is already the 4th in Prague, and still the 3rd in New York.
    const at = new Date("2026-03-03T23:30:00Z");
    expect(dayIn(PRAGUE, at)).toBe("2026-03-04");
    expect(dayIn("America/New_York", at)).toBe("2026-03-03");
  });
});

describe("startOf", () => {
  it("finds local midnight, not UTC midnight", () => {
    expect(startOf("2026-01-15", PRAGUE).toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("holds through the spring forward, when local midnight is an hour earlier in UTC", () => {
    // Prague goes to +02:00 at 02:00 on 2026-03-29.
    expect(startOf("2026-03-30", PRAGUE).toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });

  it("gives a 23-hour day on the day the clocks go forward", () => {
    const { start, end } = rangeOf("2026-03-29", PRAGUE);
    expect((end.getTime() - start.getTime()) / HOUR).toBe(23);
  });

  it("gives a 25-hour day on the day they go back", () => {
    const { start, end } = rangeOf("2026-10-25", PRAGUE);
    expect((end.getTime() - start.getTime()) / HOUR).toBe(25);
  });

  it("works in a zone that is behind UTC and one that is half an hour off", () => {
    expect(startOf("2026-01-15", "America/New_York").toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(startOf("2026-01-15", "Asia/Kolkata").toISOString()).toBe("2026-01-14T18:30:00.000Z");
  });
});

describe("timeOn", () => {
  it("puts a wall-clock reminder at that wall-clock time", () => {
    expect(timeOn("2026-01-15", PRAGUE, "18:00").toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(timeOn("2026-07-15", PRAGUE, "18:00").toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("keeps the hour on the day the clocks move", () => {
    expect(timeOn("2026-03-29", PRAGUE, "18:00").toISOString()).toBe("2026-03-29T16:00:00.000Z");
  });
});

describe("day arithmetic", () => {
  it("adds days as days, across a month, a year and a leap day", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days over a clock change, where 24-hour arithmetic would be off by one", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-30", "2026-03-28")).toBe(-2);
  });

  it("lists a range inclusively, and nothing when it runs backwards", () => {
    expect(daysFrom("2026-03-28", "2026-03-30")).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(daysFrom("2026-03-28", "2026-03-28")).toEqual(["2026-03-28"]);
    expect(daysFrom("2026-03-30", "2026-03-28")).toEqual([]);
  });
});

describe("weeks", () => {
  it("starts the week on Monday, including for a Sunday", () => {
    expect(weekdayOf("2026-08-24")).toBe(1);
    expect(weekdayOf("2026-08-30")).toBe(7);
    expect(weekStartOf("2026-08-24")).toBe("2026-08-24");
    expect(weekStartOf("2026-08-30")).toBe("2026-08-24");
    expect(weekStartOf("2026-08-31")).toBe("2026-08-31");
  });
});
