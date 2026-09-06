import { describe, expect, it } from "vitest";
import { MINUTES_PER_DAY, normalizeClock, spanBetween, toClock, toMinutes } from "./clock-text";

describe("normalizeClock", () => {
  it("reads every way a time gets typed", () => {
    expect(normalizeClock("9")).toBe("09:00");
    expect(normalizeClock("930")).toBe("09:30");
    expect(normalizeClock("9:30")).toBe("09:30");
    expect(normalizeClock("9.30")).toBe("09:30");
    expect(normalizeClock("23:59")).toBe("23:59");
    expect(normalizeClock(" 14 : 05 ")).toBe("14:05");
  });

  it("refuses what isn't a time", () => {
    expect(normalizeClock("")).toBeNull();
    expect(normalizeClock("nine")).toBeNull();
    expect(normalizeClock("24:00")).toBeNull();
    expect(normalizeClock("12:60")).toBeNull();
    expect(normalizeClock("1234:5")).toBeNull();
  });
});

describe("toMinutes", () => {
  it("counts from midnight", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("9:30")).toBe(570);
    expect(toMinutes("2359")).toBe(23 * 60 + 59);
  });

  it("has no answer for text that isn't a time", () => {
    expect(toMinutes("soon")).toBeNull();
  });
});

describe("toClock", () => {
  it("writes minutes as a clock", () => {
    expect(toClock(0)).toBe("00:00");
    expect(toClock(570)).toBe("09:30");
    expect(toClock(MINUTES_PER_DAY - 1)).toBe("23:59");
  });

  it("wraps past midnight in either direction", () => {
    expect(toClock(MINUTES_PER_DAY + 60)).toBe("01:00");
    expect(toClock(-30)).toBe("23:30");
    expect(toClock(-MINUTES_PER_DAY)).toBe("00:00");
  });
});

describe("spanBetween", () => {
  it("measures a span inside one day", () => {
    expect(spanBetween(540, 600)).toBe(60);
  });

  it("carries an end before its start into the next day", () => {
    expect(spanBetween(23 * 60, 60)).toBe(120);
    expect(spanBetween(600, 600)).toBe(MINUTES_PER_DAY);
  });
});
