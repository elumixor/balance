import { describe, expect, it } from "vitest";
import { deviceTimeZone, localDay, nextDay, orUtc, slotNow } from "./zone";

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
  it("is the morning sitting before midday and the evening one after", () => {
    expect(slotNow(new Date(2026, 7, 24, 8))).toBe("morning");
    expect(slotNow(new Date(2026, 7, 24, 11, 59))).toBe("morning");
    expect(slotNow(new Date(2026, 7, 24, 12))).toBe("evening");
    expect(slotNow(new Date(2026, 7, 24, 23))).toBe("evening");
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
