import { describe, expect, it } from "vitest";
import { asSleepScore, sleepBand, sleepScore } from "./sleep-score";
import type { SleepSummary } from "./sleep-summary";

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 3, 22, minutes));
const planned = at(60);

const night = (over: Partial<SleepSummary> = {}): SleepSummary => ({
  start: at(60).toISOString(),
  end: at(540).toISOString(),
  asleepMinutes: 470,
  stages: { deep: 60, rem: 90, core: 320 },
  awakenings: 0,
  staged: true,
  ...over,
});

describe("sleepScore", () => {
  it("a full night, to bed on time, unbroken, is 100", () => {
    expect(sleepScore(night(), planned)).toEqual({
      total: 100,
      duration: 50,
      bedtime: 30,
      interruptions: 20,
      band: "Very high",
    });
  });

  it("sleeping past a full night costs nothing", () => {
    expect(sleepScore(night({ asleepMinutes: 600, stages: { deep: 80, rem: 120, core: 400 } }), planned).duration).toBe(
      50,
    );
  });

  it("an hour short costs under six points, two hours thirteen, four everything", () => {
    const stages = { deep: 100, rem: 100, core: 200 };
    expect(sleepScore(night({ asleepMinutes: 410, stages }), planned).duration).toBe(45);
    expect(sleepScore(night({ asleepMinutes: 350, stages }), planned).duration).toBe(37);
    expect(sleepScore(night({ asleepMinutes: 230, stages }), planned).duration).toBe(0);
    expect(sleepScore(night({ asleepMinutes: 100, stages }), planned).duration).toBe(0);
  });

  it("interpolates between the knots", () => {
    expect(
      sleepScore(night({ asleepMinutes: 440, stages: { deep: 100, rem: 100, core: 240 } }), planned).duration,
    ).toBe(48);
  });

  it("thin deep and REM stages cost five each, but only when stages were recorded", () => {
    expect(sleepScore(night({ stages: { deep: 10, rem: 20, core: 440 } }), planned).duration).toBe(40);
    expect(sleepScore(night({ stages: { deep: 10, rem: 90, core: 370 } }), planned).duration).toBe(45);
    expect(sleepScore(night({ staged: false, stages: { inBed: 480 } }), planned).duration).toBe(50);
    expect(sleepScore(night({ asleepMinutes: 0, stages: {} }), planned).duration).toBe(0);
  });

  it("late to bed is free for a quarter of an hour, then a point per four and a half minutes", () => {
    expect(sleepScore(night({ start: at(74).toISOString() }), planned).bedtime).toBe(30);
    expect(sleepScore(night({ start: at(120).toISOString() }), planned).bedtime).toBe(20);
    expect(sleepScore(night({ start: at(210).toISOString() }), planned).bedtime).toBe(0);
    expect(sleepScore(night({ start: at(300).toISOString() }), planned).bedtime).toBe(0);
  });

  it("early to bed is free for an hour, then a point per half hour, at most six", () => {
    expect(sleepScore(night({ start: at(0).toISOString() }), planned).bedtime).toBe(30);
    expect(sleepScore(night({ start: at(-30).toISOString() }), planned).bedtime).toBe(29);
    expect(sleepScore(night({ start: at(-300).toISOString() }), planned).bedtime).toBe(24);
  });

  it("eleven minutes awake and two wakings are free; then four minutes or two wakings a point", () => {
    expect(
      sleepScore(night({ stages: { deep: 60, rem: 90, core: 320, awake: 11 }, awakenings: 2 }), planned).interruptions,
    ).toBe(20);
    expect(
      sleepScore(night({ stages: { deep: 60, rem: 90, core: 320, awake: 51 }, awakenings: 2 }), planned).interruptions,
    ).toBe(10);
    expect(sleepScore(night({ awakenings: 6 }), planned).interruptions).toBe(18);
    expect(
      sleepScore(night({ stages: { deep: 60, rem: 90, core: 320, awake: 200 }, awakenings: 30 }), planned)
        .interruptions,
    ).toBe(0);
  });

  it("adds the rounded parts up and names the band", () => {
    const score = sleepScore(
      night({ asleepMinutes: 350, stages: { deep: 100, rem: 100, core: 150 }, start: at(120).toISOString() }),
      planned,
    );
    expect(score).toMatchObject({ duration: 37, bedtime: 20, interruptions: 20, total: 77, band: "OK" });
  });
});

describe("sleepBand", () => {
  it("cuts where Health does", () => {
    expect([0, 40, 41, 60, 61, 80, 81, 95, 96, 100].map(sleepBand)).toEqual([
      "Very low",
      "Very low",
      "Low",
      "Low",
      "OK",
      "OK",
      "High",
      "High",
      "Very high",
      "Very high",
    ]);
  });
});

describe("asSleepScore", () => {
  it("reads a stored score back and refuses a record without one", () => {
    expect(asSleepScore(null)).toBeNull();
    expect(asSleepScore({ start: "x" })).toBeNull();
    expect(asSleepScore({ score: { total: 77 } })).toEqual({
      total: 77,
      duration: 0,
      bedtime: 0,
      interruptions: 0,
      band: "OK",
    });
    expect(asSleepScore({ score: { total: 90, duration: 45, bedtime: 25, interruptions: 20 } })).toMatchObject({
      band: "High",
      duration: 45,
    });
  });
});
