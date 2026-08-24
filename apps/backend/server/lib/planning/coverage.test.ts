import { describe, expect, it } from "bun:test";
import { type Block, balanceMatch, coverage, scheduleMatch } from "./coverage";

const HOUR = 3_600_000;
/** A day so the arithmetic reads in hours: `at(9, 11)` is nine to eleven. */
function at(from: number, to: number, categoryId: string | null = "work"): Block {
  return { start: from * HOUR, end: to * HOUR, categoryId };
}

describe("coverage", () => {
  it("measures the day against a seventh of the week's claimed hours", () => {
    // 70h claimed is 10h a day; 7 mapped hours is 70% of that.
    expect(coverage({ mappedHours: 7, weeklyClaimedHours: 70 })).toBeCloseTo(0.7);
  });

  it("is nothing when the ring claims nothing — there is no budget to fill", () => {
    expect(coverage({ mappedHours: 5, weeklyClaimedHours: 0 })).toBe(0);
  });

  it("does not pay for overfilling", () => {
    expect(coverage({ mappedHours: 40, weeklyClaimedHours: 70 })).toBe(1);
  });
});

describe("balanceMatch", () => {
  const category = (targetHours: number, actualHours: number, isBuffer = false) => ({
    targetHours,
    actualHours,
    isBuffer,
  });

  it("weights each category by how much was asked of it", () => {
    // 10h asked and met, 10h asked and half met: 15/20.
    expect(balanceMatch([category(10, 10), category(10, 5)])).toBeCloseTo(0.75);
  });

  it("does not reward overshooting one category for missing another", () => {
    expect(balanceMatch([category(10, 30), category(10, 0)])).toBeCloseTo(0.5);
  });

  it("ignores the buffer, and categories nothing was asked of", () => {
    expect(balanceMatch([category(10, 10), category(100, 0, true), category(0, 40)])).toBe(1);
  });

  it("is nothing when the ring asks for nothing", () => {
    expect(balanceMatch([])).toBe(0);
    expect(balanceMatch([category(0, 5)])).toBe(0);
  });
});

describe("scheduleMatch", () => {
  it("credits the hours that happened as drawn", () => {
    expect(scheduleMatch([at(9, 11)], [at(9, 10)])).toBeCloseTo(0.5);
  });

  it("credits a block that moved, as far as it still overlaps", () => {
    expect(scheduleMatch([at(9, 11)], [at(10, 12)])).toBeCloseTo(0.5);
  });

  it("matches by category, not by identity — a swapped block of the same kind still counts", () => {
    expect(scheduleMatch([at(9, 11, "gym")], [at(9, 11, "work")])).toBe(0);
    expect(scheduleMatch([at(9, 11, "gym")], [at(9, 11, "gym")])).toBe(1);
  });

  it("counts an hour covered twice once, so a double booking pays no more than a single one", () => {
    expect(scheduleMatch([at(9, 11)], [at(9, 11), at(9, 11)])).toBe(1);
    expect(scheduleMatch([at(9, 13)], [at(9, 11), at(10, 12)])).toBeCloseTo(0.75);
  });

  it("ignores blocks that promised nothing specific", () => {
    // Unmapped and zero-length blocks are not part of the promise, so they can't dilute it.
    expect(scheduleMatch([at(9, 11), at(11, 13, null), at(13, 13)], [at(9, 11)])).toBe(1);
  });

  it("is nothing when nothing was promised", () => {
    expect(scheduleMatch([], [at(9, 11)])).toBe(0);
  });
});
