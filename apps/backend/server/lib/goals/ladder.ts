import { addDays, type Day, weekStartOf } from "~/lib/planning/days";

export const CADENCES = ["daily", "weekly"] as const;
export type Cadence = (typeof CADENCES)[number];

export const AGGREGATES = ["sum", "max", "count"] as const;
export type Aggregate = (typeof AGGREGATES)[number];

export interface Level {
  target: number;
  label?: string;
}

/** Everything about a goal the rules read. */
export interface LadderRules {
  cadence: Cadence;
  levels: readonly Level[];
  advanceAfter: number;
  easeAfter: number;
  startsOn: Day;
}

/** Where a goal stands on a given day. */
export interface Standing {
  /** The rung in force for the current period, an index into `levels`. */
  level: number;
  target: number;
  /** The first day of the current period. */
  periodStart: Day;
  /** The first day of the period after it. */
  periodEnd: Day;
  value: number;
  met: boolean;
  /** Periods met in a row, the current one included once it is met. */
  streak: number;
  bestStreak: number;
  /** The rung the next period will be measured on, as things stand. */
  nextLevel: number;
  /** Met periods still needed, the current one included, before the goal steps up. Null on the top rung. */
  advanceIn: number | null;
}

/** The first day of the period a day falls in. A week starts on Monday, as everywhere else here. */
export function periodOf(day: Day, cadence: Cadence): Day {
  return cadence === "weekly" ? weekStartOf(day) : day;
}

export function periodLength(cadence: Cadence) {
  return cadence === "weekly" ? 7 : 1;
}

/** A period's entries as the one number its target is measured against. */
export function aggregateOf(values: readonly number[], aggregate: Aggregate) {
  if (aggregate === "count") return values.length;
  if (aggregate === "max") return values.reduce((most, value) => Math.max(most, value), 0);
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Replays a goal from its first period to today.
 *
 * Every finished period is either met or not, against the rung in force when it ran. Met
 * `advanceAfter` times in a row on one rung, the goal steps up and the count starts again; missed
 * `easeAfter` times in a row, it steps down. The streak counts met periods in a row across rungs,
 * and the period still running never breaks it: it joins the streak once it is met.
 */
export function standingOf(rules: LadderRules, totals: ReadonlyMap<Day, number>, today: Day): Standing {
  const step = periodLength(rules.cadence);
  const top = rules.levels.length - 1;
  const current = periodOf(today, rules.cadence);

  let level = 0;
  let metRun = 0;
  let missedRun = 0;
  let streak = 0;
  let bestStreak = 0;

  for (let period = periodOf(rules.startsOn, rules.cadence); period < current; period = addDays(period, step)) {
    if ((totals.get(period) ?? 0) >= rules.levels[level].target) {
      streak += 1;
      metRun += 1;
      missedRun = 0;
      bestStreak = Math.max(bestStreak, streak);
      if (metRun >= rules.advanceAfter && level < top) {
        level += 1;
        metRun = 0;
      }
    } else {
      streak = 0;
      metRun = 0;
      missedRun += 1;
      if (missedRun >= rules.easeAfter && level > 0) {
        level -= 1;
        missedRun = 0;
      }
    }
  }

  const target = rules.levels[level].target;
  const value = totals.get(current) ?? 0;
  const met = value >= target;
  if (met) streak += 1;
  const needed = level < top ? Math.max(rules.advanceAfter - metRun - (met ? 1 : 0), 0) : null;

  return {
    level,
    target,
    periodStart: current,
    periodEnd: addDays(current, step),
    value,
    met,
    streak,
    bestStreak: Math.max(bestStreak, streak),
    nextLevel: needed === 0 ? level + 1 : level,
    advanceIn: needed,
  };
}
