import { describe, expect, it } from "vitest";
import { MAX_GAP_MS, MIN_SESSION_MS, type SleepStage, sleepSessions } from "./sleep-sessions";

/** Minutes past 22:00 UTC on one evening, so a night runs past midnight without any arithmetic. */
const at = (minutes: number) => new Date(Date.UTC(2026, 8, 3, 22, minutes));
const sample = (from: number, to: number, stage: SleepStage = "core") => ({ start: at(from), end: at(to), stage });

describe("sleepSessions", () => {
  it("is empty for an empty night", () => {
    expect(sleepSessions([])).toEqual([]);
  });

  it("joins a watch's stages into one night", () => {
    const night = sleepSessions([
      sample(0, 40, "core"),
      sample(40, 90, "deep"),
      sample(90, 120, "rem"),
      sample(120, 480, "core"),
    ]);
    expect(night).toEqual([{ start: at(0), end: at(480) }]);
  });

  it("arrives in any order and still reads as one night", () => {
    expect(sleepSessions([sample(120, 480), sample(0, 120)])).toEqual([{ start: at(0), end: at(480) }]);
  });

  it("an hour awake at three in the morning is inside the night, not the end of it", () => {
    const night = sleepSessions([sample(0, 300), sample(300, 360, "awake"), sample(360, 540)]);
    expect(night).toEqual([{ start: at(0), end: at(540) }]);
  });

  it("a gap longer than a night can hold splits into two", () => {
    const gap = MAX_GAP_MS / 60_000 + 1;
    expect(sleepSessions([sample(0, 480), sample(480 + gap, 480 + gap + 60)])).toEqual([
      { start: at(0), end: at(480) },
      { start: at(480 + gap), end: at(480 + gap + 60) },
    ]);
  });

  it("a gap exactly at the limit is still the same night", () => {
    const gap = MAX_GAP_MS / 60_000;
    expect(sleepSessions([sample(0, 480), sample(480 + gap, 480 + gap + 60)])).toEqual([
      { start: at(0), end: at(480 + gap + 60) },
    ]);
  });

  it("the phone's and the watch's overlapping records are one night, ending at the later end", () => {
    const night = sleepSessions([sample(0, 480, "asleep"), sample(30, 470, "core"), sample(400, 500, "core")]);
    expect(night).toEqual([{ start: at(0), end: at(500) }]);
  });

  it("a sample already inside the night doesn't pull its end back", () => {
    expect(sleepSessions([sample(0, 480), sample(100, 200)])).toEqual([{ start: at(0), end: at(480) }]);
  });

  it("in bed only counts when nothing finer was ever recorded", () => {
    expect(sleepSessions([sample(0, 480, "inBed")])).toEqual([{ start: at(0), end: at(480) }]);
    expect(sleepSessions([sample(0, 480, "inBed"), sample(20, 460, "core")])).toEqual([
      { start: at(20), end: at(460) },
    ]);
  });

  it("awake alone is not sleep", () => {
    expect(sleepSessions([sample(0, 480, "awake")])).toEqual([]);
  });

  it("a doze too short to be a night is dropped, and an empty sample is ignored", () => {
    const short = MIN_SESSION_MS / 60_000 - 1;
    expect(sleepSessions([sample(0, short), sample(600, 600)])).toEqual([]);
    expect(sleepSessions([sample(0, short + 1)])).toEqual([{ start: at(0), end: at(short + 1) }]);
  });
});
