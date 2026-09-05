import { addDays, type Day, daysBetween, weekStartOf } from "./days";
import { applyDelta, rankOf, STARS_PER_TIER, type StarReason } from "./stars";

/**
 * The account's record, worked out from the two tables that hold it: every star ever paid, and
 * every day ever planned. What the stars pane draws is all here — the rank, the streaks, the
 * count of each kind of payout, a month of days as a strip, and which achievements have landed.
 *
 * Pure, so a rule about what counts as an achievement is a line here and a line in the test,
 * never a migration.
 */

export interface LedgerRow {
  day: Day;
  delta: number;
  reason: StarReason | string;
}

export interface PlannedRow {
  day: Day;
  ahead: boolean;
  rest: boolean;
  coveragePercent: number;
}

export interface Achievement {
  id: string;
  label: string;
  /** What it takes, said the same way whether or not it has happened. */
  detail: string;
  earned: boolean;
  /** How far along, 0..1, so an unearned one can show its progress. */
  progress: number;
}

export interface Progress {
  rank: ReturnType<typeof rankOf>;
  streak: number;
  bestStreak: number;
  plannedDays: number;
  aheadDays: number;
  restDays: number;
  weeksPlanned: number;
  /** Stars earned this calendar week. What was charged is in the total; a pane never scolds. */
  weekStars: number;
  /** Positive stars per rule, all time. */
  byReason: Record<string, number>;
  /** The last `RECENT_DAYS` days, oldest first: net stars and whether the day was planned. */
  recent: { day: Day; stars: number; planned: boolean; ahead: boolean; rest: boolean }[];
  achievements: Achievement[];
}

export const RECENT_DAYS = 28;

export function computeProgress(input: { today: Day; ledger: LedgerRow[]; days: PlannedRow[] }): Progress {
  const { today } = input;
  const ledger = [...input.ledger].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  let total = 0;
  for (const row of ledger) total = applyDelta(total, row.delta);
  const rank = rankOf(total);

  const planned = new Map(input.days.map((row) => [row.day, row]));
  // Counted from yesterday, the way the summary counts it: today is not late until it is over.
  const streak = streakEndingAt(planned, addDays(today, -1));
  const bestStreak = longestRun(input.days.map((row) => row.day));

  const byReason: Record<string, number> = {};
  for (const row of ledger) if (row.delta > 0) byReason[row.reason] = (byReason[row.reason] ?? 0) + row.delta;

  const week = weekStartOf(today);
  const weekStars = ledger
    .filter((row) => row.day >= week && row.day <= today && row.delta > 0)
    .reduce((sum, row) => sum + row.delta, 0);

  const starsByDay = new Map<Day, number>();
  for (const row of ledger) starsByDay.set(row.day, (starsByDay.get(row.day) ?? 0) + row.delta);
  const recent = Array.from({ length: RECENT_DAYS }, (_, i) => {
    const day = addDays(today, i - (RECENT_DAYS - 1));
    const row = planned.get(day);
    return { day, stars: starsByDay.get(day) ?? 0, planned: !!row, ahead: row?.ahead ?? false, rest: row?.rest ?? false };
  });

  const aheadDays = input.days.filter((row) => row.ahead).length;
  const restDays = input.days.filter((row) => row.rest).length;
  const weeksPlanned = ledger.filter((row) => row.reason === "weekly").length;
  const balanceBonuses = ledger.filter((row) => row.reason === "balance" && row.delta > 0).length;

  const gate = (id: string, label: string, detail: string, have: number, need: number): Achievement => ({
    id,
    label,
    detail,
    earned: have >= need,
    progress: Math.min(1, have / need),
  });

  const achievements: Achievement[] = [
    gate("first-day", "First page", "Plan one day", input.days.length, 1),
    gate("streak-3", "Three in a row", "Plan three days running", bestStreak, 3),
    gate("streak-7", "A whole week", "Plan seven days running", bestStreak, 7),
    gate("streak-30", "A month of mornings", "Plan thirty days running", bestStreak, 30),
    gate("ahead-10", "Night owl", "Plan ten days the evening before", aheadDays, 10),
    gate("rest-1", "Day off, on purpose", "Take one rest day", restDays, 1),
    gate("weekly-1", "The long sitting", "Plan a whole week on a Sunday", weeksPlanned, 1),
    gate("balance-1", "In balance", "Earn the balance bonus", balanceBonuses, 1),
    gate("tier-1", "First tier", `Reach ${STARS_PER_TIER} stars`, rank.stars, STARS_PER_TIER),
    gate("tier-3", "Third tier", `Reach ${STARS_PER_TIER * 3} stars`, rank.stars, STARS_PER_TIER * 3),
  ];

  return {
    rank,
    streak,
    bestStreak,
    plannedDays: input.days.length,
    aheadDays,
    restDays,
    weeksPlanned,
    weekStars,
    byReason,
    recent,
    achievements,
  };
}

/** Days planned back-to-back ending on `last`, counting `last` itself. */
function streakEndingAt(planned: Map<Day, PlannedRow>, last: Day) {
  let count = 0;
  for (let day = last; planned.has(day); day = addDays(day, -1)) count++;
  return count;
}

/** The longest run of consecutive days in the list. */
function longestRun(days: Day[]) {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}
