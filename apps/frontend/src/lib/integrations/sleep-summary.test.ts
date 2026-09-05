import { describe, expect, it } from "vitest";
import type { SleepStage } from "./sleep-sessions";
import { asSleepPlan, asSleepSummary, sleepSummary, WINDOW_SLACK_MS } from "./sleep-summary";

/** Minutes past 22:00 UTC on one evening. */
const at = (minutes: number) => new Date(Date.UTC(2026, 8, 3, 22, minutes));
const sample = (from: number, to: number, stage: SleepStage = "core") => ({ start: at(from), end: at(to), stage });
/** The planned block: 23:00 to 07:00. */
const block = { start: at(60), end: at(540) };

describe("sleepSummary", () => {
  it("is null when nothing was recorded", () => {
    expect(sleepSummary([], block)).toBeNull();
  });

  it("adds a watch's stages up and counts the awakenings", () => {
    const summary = sleepSummary(
      [
        sample(41, 100, "core"),
        sample(100, 160, "deep"),
        sample(160, 170, "awake"),
        sample(170, 250, "rem"),
        sample(250, 552, "core"),
      ],
      block,
    );
    expect(summary).toEqual({
      start: at(41).toISOString(),
      end: at(552).toISOString(),
      asleepMinutes: 59 + 60 + 80 + 302,
      stages: { core: 361, deep: 60, awake: 10, rem: 80 },
      awakenings: 1,
      staged: true,
    });
  });

  it("a phone alone knows only in bed: the night is the span, less any awake it saw", () => {
    const summary = sleepSummary([sample(30, 510, "inBed"), sample(200, 220, "awake")], block);
    expect(summary).toMatchObject({ asleepMinutes: 480 - 20, staged: false, stages: { inBed: 480, awake: 20 } });
  });

  it("a phone that saw no waking gives the whole span", () => {
    expect(sleepSummary([sample(30, 510, "inBed")], block)?.asleepMinutes).toBe(480);
  });

  it("in bed says nothing once stages exist", () => {
    const summary = sleepSummary([sample(30, 510, "inBed"), sample(40, 500, "core")], block);
    expect(summary?.stages).toEqual({ core: 460 });
    expect(summary?.asleepMinutes).toBe(460);
  });

  it("picks the night that is this block's, not the nap on the same afternoon", () => {
    const nap = sample(-540, -480);
    const night = sample(50, 500);
    expect(sleepSummary([nap, night], block)?.start).toBe(at(50).toISOString());
  });

  it("a night entirely outside the block's reach is nobody's", () => {
    const slack = WINDOW_SLACK_MS / 60_000;
    expect(sleepSummary([sample(540 + slack + 1, 540 + slack + 60)], block)).toBeNull();
  });
});

describe("asSleepSummary", () => {
  it("refuses nothing, and refuses a record of some other shape", () => {
    expect(asSleepSummary(null)).toBeNull();
    expect(asSleepSummary({ steps: 12000 })).toBeNull();
  });

  it("fills in what an older record left out", () => {
    const summary = asSleepSummary({ start: "a", end: "b", asleepMinutes: 400 });
    expect(summary).toEqual({ start: "a", end: "b", asleepMinutes: 400, stages: {}, awakenings: 0, staged: false });
  });
});

describe("asSleepPlan", () => {
  it("reads the planned block back, and nothing from a record written before there was one", () => {
    expect(asSleepPlan(null)).toBeNull();
    expect(asSleepPlan({ start: "x" })).toBeNull();
    expect(asSleepPlan({ plannedStart: "a", plannedEnd: "b", other: 1 })).toEqual({
      plannedStart: "a",
      plannedEnd: "b",
    });
  });
});
