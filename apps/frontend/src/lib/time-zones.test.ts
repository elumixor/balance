import { describe, expect, it } from "vitest";
import {
  allZones,
  defaultZones,
  isValidZone,
  MAX_MATCHES,
  offsetLabel,
  offsetMinutes,
  searchZones,
  shiftZone,
} from "./time-zones";

const summer = new Date("2026-07-01T12:00:00Z");
const winter = new Date("2026-01-15T12:00:00Z");

describe("offsetLabel", () => {
  it("writes the offset the way people do, and follows the clocks", () => {
    expect(offsetLabel("Europe/Kyiv", summer)).toBe("GMT+3");
    expect(offsetLabel("Europe/Kyiv", winter)).toBe("GMT+2");
    expect(offsetLabel("America/New_York", winter)).toBe("GMT-5");
    expect(offsetLabel("Asia/Kolkata", winter)).toBe("GMT+5:30");
    expect(offsetLabel("UTC", winter)).toBe("GMT");
  });

  it("falls back to GMT for a zone that isn't one", () => {
    expect(offsetLabel("Nowhere/Land", winter)).toBe("GMT");
  });
});

describe("isValidZone", () => {
  it("accepts IANA names and refuses the rest", () => {
    expect(isValidZone("Europe/Prague")).toBe(true);
    expect(isValidZone("UTC")).toBe(true);
    expect(isValidZone("Prague")).toBe(false);
    expect(isValidZone("")).toBe(false);
  });
});

describe("searchZones", () => {
  it("finds by city first, then by any word, then anywhere in the name", () => {
    expect(searchZones("kyiv")[0]?.zone).toBe("Europe/Kyiv");
    expect(searchZones("new york")[0]?.zone).toBe("America/New_York");
    expect(searchZones("york")[0]?.zone).toBe("America/New_York");
    expect(searchZones("europe/p").map((z) => z.city)).toContain("Prague");
  });

  it("shows nothing for nothing, and never more than the cap", () => {
    expect(searchZones("  ")).toEqual([]);
    expect(searchZones("a").length).toBe(MAX_MATCHES);
    expect(searchZones("zzzz")).toEqual([]);
  });

  it("searches whatever list it's handed", () => {
    const zones = [
      { zone: "Europe/Prague", city: "Prague" },
      { zone: "Europe/Paris", city: "Paris" },
    ];
    expect(searchZones("pr", zones).map((z) => z.city)).toEqual(["Prague"]);
  });
});

describe("allZones and defaultZones", () => {
  it("restores the spaces in a city's name, and calls Kyiv what Kyiv calls itself", () => {
    expect(allZones().find((z) => z.zone === "America/New_York")?.city).toBe("New York");
    expect(allZones().some((z) => z.zone === "Europe/Kiev")).toBe(false);
    expect(allZones().filter((z) => z.zone === "Europe/Kyiv")).toHaveLength(1);
  });

  it("puts the device's zone first and lists it once", () => {
    const zones = defaultZones("Europe/Kyiv").map((z) => z.zone);
    expect(zones[0]).toBe("Europe/Kyiv");
    expect(zones.filter((z) => z === "Europe/Kyiv")).toHaveLength(1);
    expect(defaultZones("Pacific/Auckland")[0]).toEqual({ zone: "Pacific/Auckland", city: "Auckland" });
  });
});

describe("offsetMinutes and shiftZone", () => {
  it("measures the offset in minutes, either side of the meridian", () => {
    expect(offsetMinutes("Europe/Kyiv", winter)).toBe(120);
    expect(offsetMinutes("America/New_York", winter)).toBe(-300);
    expect(offsetMinutes("Asia/Kolkata", winter)).toBe(330);
    expect(offsetMinutes("UTC", summer)).toBe(0);
  });

  it("keeps the wall clock and moves the instant", () => {
    const nineInPrague = new Date("2026-01-15T08:00:00Z");
    expect(shiftZone(nineInPrague, "Europe/Prague", "Europe/Kyiv").toISOString()).toBe("2026-01-15T07:00:00.000Z");
    expect(shiftZone(nineInPrague, "Europe/Prague", "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(shiftZone(nineInPrague, "Europe/Prague", "Europe/Prague")).toEqual(nineInPrague);
  });

  it("copes with a target zone whose clocks have moved by the answer", () => {
    // 23:30 on 28 March in London is 23:30 on the last night before British Summer Time;
    // the same wall clock in Kyiv, which moved that morning, is UTC+3 rather than +2.
    const late = new Date("2026-03-28T23:30:00Z");
    expect(shiftZone(late, "Europe/London", "Europe/Kyiv").toISOString()).toBe("2026-03-28T21:30:00.000Z");
  });
});
