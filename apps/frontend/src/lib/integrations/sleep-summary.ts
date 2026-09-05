import { type SleepSample, type SleepStage, sleepSessions } from "./sleep-sessions";

/**
 * One night, as the card under a "Sleep" block shows it.
 *
 * The block is where the night was expected — eleven to seven, every night. Health has what
 * happened, as samples. The summary is the night those samples make that belongs to this block:
 * the session overlapping it most, since a nap on the same afternoon is a different thing. The
 * block is then moved to that night, so the next read finds it where the record already is. Everything is in minutes and
 * instants, so the card can say "7h 20m, 23:41 to 07:12" without touching a sample again.
 *
 * This is what a record holds on the server (`integration_records.data`), so its shape is a
 * contract with every build that reads it back — add to it, never rename.
 */
export interface SleepSummary {
  /** When sleep began and ended, as ISO instants. */
  readonly start: string;
  readonly end: string;
  /** Time actually asleep — every stage but awake. */
  readonly asleepMinutes: number;
  /** Minutes in each stage; only the stages this night had. */
  readonly stages: Partial<Record<SleepStage, number>>;
  /** How many separate awake stretches were recorded inside the night. */
  readonly awakenings: number;
  /** Whether stages were recorded at all — a phone alone only ever knows "in bed". */
  readonly staged: boolean;
}

/** How far either side of the block a night may lie and still be its night. */
export const WINDOW_SLACK_MS = 4 * 60 * 60_000;

const ASLEEP: readonly SleepStage[] = ["asleep", "core", "deep", "rem"];

export function sleepSummary(samples: readonly SleepSample[], block: { start: Date; end: Date }): SleepSummary | null {
  const sessions = sleepSessions(samples);
  const from = block.start.getTime() - WINDOW_SLACK_MS;
  const to = block.end.getTime() + WINDOW_SLACK_MS;
  let best: { start: Date; end: Date } | null = null;
  let bestOverlap = 0;
  for (const session of sessions) {
    const overlap = Math.min(session.end.getTime(), to) - Math.max(session.start.getTime(), from);
    if (overlap > bestOverlap) {
      best = session;
      bestOverlap = overlap;
    }
  }
  if (!best) return null;

  const inside = samples.filter(
    (s) => s.end.getTime() > best.start.getTime() && s.start.getTime() < best.end.getTime(),
  );
  const staged = inside.some((s) => s.stage === "core" || s.stage === "deep" || s.stage === "rem");
  const stages: Partial<Record<SleepStage, number>> = {};
  let awakenings = 0;
  for (const sample of inside) {
    // In-bed spans wrap the night rather than describe it; once stages exist they say nothing new.
    if (sample.stage === "inBed" && staged) continue;
    const minutes = Math.round((sample.end.getTime() - sample.start.getTime()) / 60_000);
    stages[sample.stage] = (stages[sample.stage] ?? 0) + minutes;
    if (sample.stage === "awake") awakenings += 1;
  }
  const asleepMinutes = staged
    ? ASLEEP.reduce((sum, stage) => sum + (stages[stage] ?? 0), 0)
    : Math.round((best.end.getTime() - best.start.getTime()) / 60_000) - (stages.awake ?? 0);

  return {
    start: best.start.toISOString(),
    end: best.end.toISOString(),
    asleepMinutes,
    stages,
    awakenings,
    staged,
  };
}

/**
 * When the block said the night would be, before it was moved to when it was. Written into the
 * record on the first sync and carried forward by every later one, since the calendar has by then
 * forgotten; what "as planned" and "to bed on time" are measured against.
 */
export interface SleepPlan {
  readonly plannedStart: string;
  readonly plannedEnd: string;
}

export function asSleepPlan(record: Record<string, unknown> | null): SleepPlan | null {
  const { plannedStart, plannedEnd } = (record ?? {}) as Partial<SleepPlan>;
  return typeof plannedStart === "string" && typeof plannedEnd === "string" ? { plannedStart, plannedEnd } : null;
}

/** Reads a stored record back, refusing anything an older build or a different feed wrote. */
export function asSleepSummary(record: Record<string, unknown> | null): SleepSummary | null {
  if (!record) return null;
  const { start, end, asleepMinutes, stages, awakenings, staged } = record as Partial<SleepSummary>;
  if (typeof start !== "string" || typeof end !== "string" || typeof asleepMinutes !== "number") return null;
  return { start, end, asleepMinutes, stages: stages ?? {}, awakenings: awakenings ?? 0, staged: staged ?? false };
}
