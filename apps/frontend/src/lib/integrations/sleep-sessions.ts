/**
 * Nights out of what Apple Health records.
 *
 * Health doesn't store a night; it stores samples — a watch writes one per sleep stage, a few
 * minutes each, and a phone left on the nightstand writes one "in bed" span over the lot. The
 * calendar wants the night: from the moment sleep started to the moment it ended, one block, the
 * way a person would write it. So the samples are merged: anything asleep, from any source,
 * sorted and joined wherever the gap between two is short enough to still be the same night.
 *
 * Awake samples are not the night's edges, they are what happens inside it — an hour awake at
 * three in the morning is still part of having been in bed from eleven to seven — so they are
 * dropped and the gap they leave is bridged like any other. "In bed" is only used when nothing
 * finer exists: a phone-only setup that never saw a stage still gets its nights.
 */

export type SleepStage = "inBed" | "awake" | "asleep" | "core" | "deep" | "rem";

export interface SleepSample {
  readonly start: Date;
  readonly end: Date;
  readonly stage: SleepStage;
}

interface SleepSession {
  readonly start: Date;
  readonly end: Date;
}

/** Two stretches of sleep this close together are one night with a gap in it, not two nights. */
export const MAX_GAP_MS = 90 * 60_000;

/** Shorter than this and it's a sensor glitch, or a doze nobody would put on a calendar. */
export const MIN_SESSION_MS = 20 * 60_000;

const ASLEEP: ReadonlySet<SleepStage> = new Set(["asleep", "core", "deep", "rem"]);

export function sleepSessions(samples: readonly SleepSample[]): SleepSession[] {
  const asleep = samples.filter((sample) => ASLEEP.has(sample.stage));
  const chosen = asleep.length > 0 ? asleep : samples.filter((sample) => sample.stage === "inBed");

  const sorted = chosen
    .filter((sample) => sample.end.getTime() > sample.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const sessions: { start: Date; end: Date }[] = [];
  for (const sample of sorted) {
    const last = sessions[sessions.length - 1];
    if (last && sample.start.getTime() - last.end.getTime() <= MAX_GAP_MS) {
      if (sample.end.getTime() > last.end.getTime()) last.end = sample.end;
    } else {
      sessions.push({ start: sample.start, end: sample.end });
    }
  }

  return sessions.filter((session) => session.end.getTime() - session.start.getTime() >= MIN_SESSION_MS);
}
