import type { SleepSummary } from "./sleep-summary";

/**
 * The night as a number, the way the Health app grades it.
 *
 * Apple keeps its Sleep Score to itself — nothing in HealthKit hands it out — but it is worked
 * out from the same stages this app already reads, and Apple has said what counts: how long you
 * slept, out of 50; whether you went to bed when you meant to, out of 30; and how broken the
 * night was, out of 20. The rules here are those, as published, so the number on the card is the
 * one on the wrist give or take a point. "When you meant to" is the block itself: the time the
 * series was planned for, kept from before the block was moved to the night that happened.
 */
interface SleepScore {
  readonly total: number;
  readonly duration: number;
  readonly bedtime: number;
  readonly interruptions: number;
  readonly band: SleepBand;
}

type SleepBand = "Very low" | "Low" | "OK" | "High" | "Very high";

/** What a full night is; anything longer is not held against you. */
const FULL_NIGHT_MINUTES = 7 * 60 + 50;
/**
 * Points lost against minutes short of a full night — steeper the shorter it gets: under six
 * for one hour short, thirteen for two, everything past four.
 */
const SHORTFALL_KNOTS: readonly [minutes: number, lost: number][] = [
  [0, 0],
  [60, 5],
  [120, 13],
  [180, 35],
  [240, 50],
];
/** Below these shares of the night, a stage is "low" and costs five points each. */
const LOW_DEEP_SHARE = 0.1;
const LOW_REM_SHARE = 0.15;
/** Late to bed: free for a quarter of an hour, then a point every four and a half minutes. */
const LATE_GRACE_MINUTES = 15;
const LATE_MINUTES_PER_POINT = 4.5;
/** Early to bed: free for an hour, then a point every half hour, and never more than six. */
const EARLY_GRACE_MINUTES = 60;
const EARLY_MINUTES_PER_POINT = 30;
const EARLY_MAX_POINTS = 6;
/** Awake: eleven minutes are nobody's fault, then a point every four; two wakings are free, then a point per two. */
const AWAKE_GRACE_MINUTES = 11;
const AWAKE_MINUTES_PER_POINT = 4;
const FREE_AWAKENINGS = 2;
const AWAKENINGS_PER_POINT = 2;

function shortfallPoints(asleepMinutes: number) {
  const short = FULL_NIGHT_MINUTES - asleepMinutes;
  if (short <= 0) return 0;
  for (let i = 1; i < SHORTFALL_KNOTS.length; i++) {
    const [m0, p0] = SHORTFALL_KNOTS[i - 1];
    const [m1, p1] = SHORTFALL_KNOTS[i];
    if (short <= m1) return p0 + ((short - m0) / (m1 - m0)) * (p1 - p0);
  }
  return 50;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function sleepScore(summary: SleepSummary, plannedStart: Date): SleepScore {
  let duration = 50 - shortfallPoints(summary.asleepMinutes);
  if (summary.staged && summary.asleepMinutes > 0) {
    if ((summary.stages.deep ?? 0) / summary.asleepMinutes < LOW_DEEP_SHARE) duration -= 5;
    if ((summary.stages.rem ?? 0) / summary.asleepMinutes < LOW_REM_SHARE) duration -= 5;
  }
  duration = clamp(duration, 0, 50);

  const offset = (new Date(summary.start).getTime() - plannedStart.getTime()) / 60_000;
  let bedtime = 30;
  if (offset >= LATE_GRACE_MINUTES) bedtime -= (offset - LATE_GRACE_MINUTES) / LATE_MINUTES_PER_POINT;
  else if (-offset > EARLY_GRACE_MINUTES)
    bedtime -= Math.min(EARLY_MAX_POINTS, Math.floor((-offset - EARLY_GRACE_MINUTES) / EARLY_MINUTES_PER_POINT));
  bedtime = clamp(bedtime, 0, 30);

  const awake = summary.stages.awake ?? 0;
  let interruptions = 20;
  if (awake > AWAKE_GRACE_MINUTES) interruptions -= (awake - AWAKE_GRACE_MINUTES) / AWAKE_MINUTES_PER_POINT;
  if (summary.awakenings > FREE_AWAKENINGS)
    interruptions -= (summary.awakenings - FREE_AWAKENINGS) / AWAKENINGS_PER_POINT;
  interruptions = clamp(interruptions, 0, 20);

  const parts = {
    duration: Math.round(duration),
    bedtime: Math.round(bedtime),
    interruptions: Math.round(interruptions),
  };
  const total = parts.duration + parts.bedtime + parts.interruptions;
  return { total, ...parts, band: sleepBand(total) };
}

/** The word Health puts over the number. */
export function sleepBand(total: number): SleepBand {
  if (total >= 96) return "Very high";
  if (total >= 81) return "High";
  if (total >= 61) return "OK";
  if (total >= 41) return "Low";
  return "Very low";
}

/** Reads a stored score back; null from a record an older build wrote without one. */
export function asSleepScore(record: Record<string, unknown> | null): SleepScore | null {
  const score = record?.score as Partial<SleepScore> | undefined;
  if (!score || typeof score.total !== "number") return null;
  return {
    total: score.total,
    duration: score.duration ?? 0,
    bedtime: score.bedtime ?? 0,
    interruptions: score.interruptions ?? 0,
    band: sleepBand(score.total),
  };
}
