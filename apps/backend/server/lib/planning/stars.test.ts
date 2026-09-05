import { describe, expect, it } from "bun:test";
import {
  applyDelta,
  balanceBonus,
  dailyAward,
  rankOf,
  STARS_PER_TIER,
  scheduleBonus,
  subtierOf,
  tierOf,
} from "./stars";

describe("dailyAward", () => {
  it("pays the base star for planning at all", () => {
    expect(dailyAward({ ahead: false, streak: 0 })).toEqual([{ reason: "daily", delta: 1 }]);
  });

  it("pays extra for planning the evening before", () => {
    expect(dailyAward({ ahead: true, streak: 0 })).toEqual([
      { reason: "daily", delta: 1 },
      { reason: "ahead", delta: 1 },
    ]);
  });

  it("pays nothing for a day planned after its morning is gone", () => {
    expect(dailyAward({ ahead: false, streak: 5, late: true })).toEqual([]);
  });

  it("starts the streak bonus on the third consecutive day, not the fourth", () => {
    // Two days already behind it, so this commit is the third.
    expect(dailyAward({ ahead: false, streak: 2 }).map((a) => a.reason)).toEqual(["daily", "streak"]);
    expect(dailyAward({ ahead: false, streak: 1 }).map((a) => a.reason)).toEqual(["daily"]);
  });
});

describe("bonuses", () => {
  it("pays a quarter of the week for living it exactly", () => {
    expect(balanceBonus({ earned: 8, match: 1 })).toEqual({ reason: "balance", delta: 2 });
  });

  it("interpolates, and rounds a part-star up rather than away", () => {
    // 8 * 0.5 * 0.25 = 1 exactly; 5 * 0.5 * 0.25 = 0.625, which must not become zero.
    expect(balanceBonus({ earned: 8, match: 0.5 })?.delta).toBe(1);
    expect(balanceBonus({ earned: 5, match: 0.5 })?.delta).toBe(1);
  });

  it("pays nothing for a day that matched nothing, and nothing on nothing earned", () => {
    expect(scheduleBonus({ earned: 3, match: 0 })).toBeNull();
    expect(scheduleBonus({ earned: 0, match: 1 })).toBeNull();
    expect(balanceBonus({ earned: -2, match: 1 })).toBeNull();
  });

  it("clamps a match that came back out of range", () => {
    expect(scheduleBonus({ earned: 10, match: 4 })?.delta).toBe(1);
    expect(scheduleBonus({ earned: 10, match: -1 })).toBeNull();
  });

  it("keeps the day's bonus smaller than the week's for the same match", () => {
    expect(scheduleBonus({ earned: 20, match: 1 })?.delta).toBeLessThan(
      balanceBonus({ earned: 20, match: 1 })?.delta ?? 0,
    );
  });
});

describe("applyDelta", () => {
  it("adds without a ceiling", () => {
    expect(applyDelta(10, 3)).toBe(13);
  });

  it("never goes negative", () => {
    expect(applyDelta(0, -1)).toBe(0);
    expect(applyDelta(1, -5)).toBe(0);
  });

  it("never drops a tier that was reached", () => {
    // 35 is the first star of tier 1; a loss can cost subtiers above it but not the tier itself.
    expect(applyDelta(STARS_PER_TIER, -1)).toBe(STARS_PER_TIER);
    expect(applyDelta(STARS_PER_TIER + 3, -10)).toBe(STARS_PER_TIER);
    expect(applyDelta(STARS_PER_TIER + 10, -3)).toBe(STARS_PER_TIER + 7);
  });
});

describe("rank", () => {
  it("counts seven stars to a subtier and five subtiers to a tier", () => {
    expect(tierOf(0)).toBe(0);
    expect(subtierOf(6)).toBe(0);
    expect(subtierOf(7)).toBe(1);
    expect(subtierOf(34)).toBe(4);
    expect(tierOf(35)).toBe(1);
    expect(subtierOf(35)).toBe(0);
  });

  it("treats a negative total as nothing rather than as a tier below zero", () => {
    expect(tierOf(-5)).toBe(0);
    expect(subtierOf(-5)).toBe(0);
    expect(rankOf(-5).stars).toBe(0);
  });

  it("says how far the next line is", () => {
    expect(rankOf(9)).toEqual({ stars: 9, tier: 0, subtier: 1, progress: 2, progressOf: 7, toNextSubtier: 5 });
    expect(rankOf(7).toNextSubtier).toBe(7);
  });
});
