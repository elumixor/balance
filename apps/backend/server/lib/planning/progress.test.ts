import { describe, expect, it } from "bun:test";
import { computeProgress, RECENT_DAYS } from "./progress";
import { STARS_PER_TIER } from "./stars";

const day = (n: number) => `2026-09-${`${n}`.padStart(2, "0")}`;
const planned = (n: number, ahead = true, rest = false) => ({ day: day(n), ahead, rest, coveragePercent: 80 });

describe("computeProgress", () => {
  it("adds the ledger up the way the rank does", () => {
    const progress = computeProgress({
      today: day(10),
      ledger: [
        { day: day(1), delta: 3, reason: "daily" },
        { day: day(2), delta: -1, reason: "missed" },
        { day: day(3), delta: 5, reason: "weekly" },
      ],
      days: [],
    });
    expect(progress.rank.stars).toBe(7);
    expect(progress.byReason).toEqual({ daily: 3, weekly: 5 });
  });

  it("counts the streak from yesterday and the best run ever", () => {
    const progress = computeProgress({
      today: day(10),
      ledger: [],
      days: [planned(1), planned(2), planned(3), planned(4), planned(8), planned(9)],
    });
    expect(progress.streak).toBe(2);
    expect(progress.bestStreak).toBe(4);
  });

  it("has no streak when yesterday was not planned", () => {
    expect(computeProgress({ today: day(10), ledger: [], days: [planned(8)] }).streak).toBe(0);
  });

  it("sums this week's stars only", () => {
    const progress = computeProgress({
      today: "2026-09-09",
      ledger: [
        { day: "2026-09-06", delta: 4, reason: "daily" },
        { day: "2026-09-07", delta: 2, reason: "daily" },
        { day: "2026-09-08", delta: -1, reason: "missed" },
        { day: "2026-09-09", delta: 1, reason: "daily" },
      ],
      days: [],
    });
    expect(progress.weekStars).toBe(3);
  });

  it("draws the last four weeks as a strip ending today", () => {
    const progress = computeProgress({
      today: day(28),
      ledger: [{ day: day(27), delta: 2, reason: "daily" }],
      days: [planned(27, false, true)],
    });
    expect(progress.recent).toHaveLength(RECENT_DAYS);
    expect(progress.recent.at(-1)?.day).toBe(day(28));
    expect(progress.recent.at(-2)).toEqual({ day: day(27), stars: 2, planned: true, ahead: false, rest: true });
  });

  it("marks achievements earned and shows progress on the rest", () => {
    const progress = computeProgress({
      today: day(10),
      ledger: Array.from({ length: STARS_PER_TIER }, (_, i) => ({ day: day(1), delta: 1, reason: `r${i}` })),
      days: [planned(1), planned(2), planned(3)],
    });
    const byId = new Map(progress.achievements.map((a) => [a.id, a]));
    expect(byId.get("first-day")?.earned).toBe(true);
    expect(byId.get("streak-3")?.earned).toBe(true);
    expect(byId.get("streak-7")?.earned).toBe(false);
    expect(byId.get("streak-7")?.progress).toBeCloseTo(3 / 7);
    expect(byId.get("tier-1")?.earned).toBe(true);
    expect(byId.get("ahead-10")?.progress).toBeCloseTo(0.3);
  });
});
