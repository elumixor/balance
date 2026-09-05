import { describe, expect, it } from "vitest";
import {
  deviceTimeZone,
  localDay,
  minutesOf,
  nextDay,
  orUtc,
  slotNow,
} from "./zone";

describe("localDay", () => {
  it("names the local day, not UTC's — late evening is still today", () => {
    // 23:30 local on the 3rd is the 4th in UTC for anywhere west of Greenwich, and the day here
    // has to be the one the user is living in.
    expect(localDay(new Date(2026, 2, 3, 23, 30))).toBe("2026-03-03");
    expect(localDay(new Date(2026, 2, 3, 0, 30))).toBe("2026-03-03");
  });

  it("pads the month and the day", () => {
    expect(localDay(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("nextDay", () => {
  it("crosses a month, a year and a leap day", () => {
    expect(nextDay("2026-01-31")).toBe("2026-02-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
  });

  it("adds a day rather than 24 hours, so a clock change can't skip or repeat one", () => {
    expect(nextDay("2026-03-29")).toBe("2026-03-30");
    expect(nextDay("2026-10-25")).toBe("2026-10-26");
  });
});

describe("slotNow", () => {
  it("is the morning sitting until the evening one is due, and the evening one from then on", () => {
    expect(slotNow(new Date(2026, 7, 24, 8), "18:00")).toBe("morning");
    expect(slotNow(new Date(2026, 7, 24, 14, 31), "18:00")).toBe("morning");
    expect(slotNow(new Date(2026, 7, 24, 17, 59), "18:00")).toBe("morning");
    expect(slotNow(new Date(2026, 7, 24, 18), "18:00")).toBe("evening");
    expect(slotNow(new Date(2026, 7, 24, 23), "18:00")).toBe("evening");
  });

  it("follows the account's own evening, not the clock's midday", () => {
    expect(slotNow(new Date(2026, 7, 24, 21, 30), "21:30")).toBe("evening");
    expect(slotNow(new Date(2026, 7, 24, 21, 29), "21:30")).toBe("morning");
  });

  it("treats an unreadable time as midnight", () => {
    expect(slotNow(new Date(2026, 7, 24, 0, 0), "garbage")).toBe("evening");
  });
});

describe("minutesOf", () => {
  it("reads a clock time into minutes and an unreadable one as midnight", () => {
    expect(minutesOf("18:30")).toBe(1110);
    expect(minutesOf("x")).toBe(0);
  });
});

describe("deviceTimeZone", () => {
  it("answers with a zone the server can read back", () => {
    expect(deviceTimeZone()).toMatch(/^[A-Za-z]+(\/[A-Za-z_+\-0-9]+)*$/);
  });

  it("falls back to UTC rather than sending the server an empty zone", () => {
    expect(orUtc(undefined)).toBe("UTC");
    expect(orUtc("")).toBe("UTC");
    expect(orUtc("Europe/Prague")).toBe("Europe/Prague");
  });
});
