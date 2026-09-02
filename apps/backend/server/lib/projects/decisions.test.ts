import { describe, expect, it } from "bun:test";
import { checkpointsBetween, decideOnFor, dueCheckpoint, extendedDecideOn } from "./decisions";

describe("decideOnFor", () => {
  it("lands later at a slower rate, with no priority field involved", () => {
    const fast = decideOnFor({ startedOn: "2026-09-01", budgetHours: 40, hoursPerWeek: 8, windowDays: 7 });
    const slow = decideOnFor({ startedOn: "2026-09-01", budgetHours: 40, hoursPerWeek: 1, windowDays: 7 });
    expect(fast).toBe("2026-10-06");
    expect(slow).toBe("2027-06-08");
  });

  it("rounds a part-week up rather than deciding before the work is done", () => {
    // 10h at 4h/week = 2.5 weeks = 17.5 days -> 18.
    expect(decideOnFor({ startedOn: "2026-09-01", budgetHours: 10, hoursPerWeek: 4, windowDays: 7 })).toBe(
      "2026-09-19",
    );
  });

  it("never lands before the gate's window can close", () => {
    expect(decideOnFor({ startedOn: "2026-09-01", budgetHours: 1, hoursPerWeek: 10, windowDays: 30 })).toBe(
      "2026-10-01",
    );
  });

  it("gives a stage with no hours a near date rather than none", () => {
    expect(decideOnFor({ startedOn: "2026-09-01", budgetHours: 40, hoursPerWeek: 0, windowDays: 0 })).toBe(
      "2026-09-08",
    );
  });

  it("takes an external deadline as it is", () => {
    expect(
      decideOnFor({
        startedOn: "2026-09-01",
        budgetHours: 400,
        hoursPerWeek: 1,
        windowDays: 7,
        deadline: "2026-09-15",
      }),
    ).toBe("2026-09-15");
  });

  it("crosses a month and a year without rolling either", () => {
    expect(decideOnFor({ startedOn: "2026-12-28", budgetHours: 14, hoursPerWeek: 7, windowDays: 7 })).toBe(
      "2027-01-11",
    );
  });
});

describe("extension and checkpoints", () => {
  it("extends by exactly two weeks", () => {
    expect(extendedDecideOn("2026-09-30")).toBe("2026-10-14");
  });

  it("puts a checkpoint every fortnight, never on the decision day itself", () => {
    expect(checkpointsBetween("2026-09-01", "2026-10-13")).toEqual(["2026-09-15", "2026-09-29"]);
    expect(checkpointsBetween("2026-09-01", "2026-09-15")).toEqual([]);
    expect(checkpointsBetween("2026-09-01", "2026-09-08")).toEqual([]);
  });

  it("owes the latest checkpoint that has come round and not been looked at", () => {
    const stage = { startedOn: "2026-09-01", decideOn: "2026-11-01" };
    expect(dueCheckpoint({ ...stage, today: "2026-09-14", looked: [] })).toBeNull();
    expect(dueCheckpoint({ ...stage, today: "2026-09-15", looked: [] })).toBe("2026-09-15");
    expect(dueCheckpoint({ ...stage, today: "2026-10-02", looked: [] })).toBe("2026-09-29");
    expect(dueCheckpoint({ ...stage, today: "2026-10-02", looked: ["2026-09-29"] })).toBeNull();
  });
});
