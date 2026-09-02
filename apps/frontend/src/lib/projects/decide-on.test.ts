import { describe, expect, it } from "vitest";
import { addDaysKey, checkpointsBetween, daysBetweenKeys, decideOnFor, dueCheckpoint, formatDayKey } from "./decide-on";

describe("day keys", () => {
  it("adds days across month and year ends without rolling", () => {
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetweenKeys("2026-09-01", "2026-10-01")).toBe(30);
    expect(daysBetweenKeys("2026-10-01", "2026-09-30")).toBe(-1);
  });

  it("formats a key as a day, not as the instant before it in a western zone", () => {
    expect(formatDayKey("2026-10-06")).toMatch(/Oct 6/);
  });
});

describe("decideOnFor", () => {
  const base = { startedOn: "2026-09-01", windowDays: 7 };

  it("lands later at a slower rate", () => {
    expect(decideOnFor({ ...base, budgetHours: 40, hoursPerWeek: 8 })).toBe("2026-10-06");
    expect(decideOnFor({ ...base, budgetHours: 40, hoursPerWeek: 1 })).toBe("2027-06-08");
  });

  it("never lands before the window closes, nor within the first week", () => {
    expect(decideOnFor({ ...base, budgetHours: 1, hoursPerWeek: 10, windowDays: 30 })).toBe("2026-10-01");
    expect(decideOnFor({ ...base, budgetHours: 40, hoursPerWeek: 0, windowDays: 0 })).toBe("2026-09-08");
  });

  it("takes a deadline as it is, and ignores an empty one", () => {
    expect(decideOnFor({ ...base, budgetHours: 400, hoursPerWeek: 1, deadline: "2026-09-15" })).toBe("2026-09-15");
    expect(decideOnFor({ ...base, budgetHours: 14, hoursPerWeek: 7, deadline: null })).toBe("2026-09-15");
  });
});

describe("checkpoints", () => {
  it("falls every fortnight and never on the decision day", () => {
    expect(checkpointsBetween("2026-09-01", "2026-10-13")).toEqual(["2026-09-15", "2026-09-29"]);
    expect(checkpointsBetween("2026-09-01", "2026-09-15")).toEqual([]);
  });

  it("owes only the latest one that has come round and wasn't looked at", () => {
    const stage = { startedOn: "2026-09-01", decideOn: "2026-11-01" };
    expect(dueCheckpoint({ ...stage, today: "2026-09-14", looked: [] })).toBeNull();
    expect(dueCheckpoint({ ...stage, today: "2026-10-02", looked: [] })).toBe("2026-09-29");
    expect(dueCheckpoint({ ...stage, today: "2026-10-02", looked: ["2026-09-29"] })).toBeNull();
  });
});
