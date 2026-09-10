import { describe, expect, it } from "vitest";
import {
  entryToClock,
  MINUTES_PER_DAY,
  normalizeClock,
  parseDuration,
  spanBetween,
  toClock,
  toMinutes,
} from "./clock-text";

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

describe("parseDuration", () => {
  it("reads a span however it is written", () => {
    expect(parseDuration("6m")).toBe(6);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("90m")).toBe(90);
    expect(parseDuration("1h")).toBe(60);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("1h 30 m")).toBe(90);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("+90")).toBe(90);
    expect(parseDuration("+1h")).toBe(60);
    expect(parseDuration("24h")).toBe(MINUTES_PER_DAY);
  });

  it("refuses a bare number, which is a time of day", () => {
    expect(parseDuration("930")).toBeNull();
    expect(parseDuration("6")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("+")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
  });

  it("refuses a span that is no span at all, or longer than a day", () => {
    expect(parseDuration("0m")).toBeNull();
    expect(parseDuration("0h")).toBeNull();
    expect(parseDuration("+0")).toBeNull();
    expect(parseDuration("25h")).toBeNull();
  });
});

describe("entryToClock", () => {
  const nine = toMinutes("09:00");

  it("takes a time of day as it stands", () => {
    expect(entryToClock("1403", nine, true)).toBe("14:03");
    expect(entryToClock("14:03", null, false)).toBe("14:03");
  });

  it("measures a span from the other end, each way", () => {
    expect(entryToClock("6m", nine, true)).toBe("09:06");
    expect(entryToClock("1h30", nine, true)).toBe("10:30");
    expect(entryToClock("6m", nine, false)).toBe("08:54");
  });

  it("wraps past midnight rather than refusing", () => {
    expect(entryToClock("2h", toMinutes("23:30"), true)).toBe("01:30");
  });

  it("has no answer for a span with nothing to measure from, or for neither", () => {
    expect(entryToClock("6m", null, true)).toBeNull();
    expect(entryToClock("soon", nine, true)).toBeNull();
  });
});
