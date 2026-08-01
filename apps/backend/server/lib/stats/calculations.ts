// Pure calculation helpers for the Statistics screen.
// No DB access here — everything takes plain data in and returns plain data out,
// so it can be unit tested without touching Drizzle/Neon.

import { addDays, addMonths, subDays, subMonths, subWeeks } from "date-fns";

export type PeriodKind = "day" | "week" | "month" | "custom";
export type BalanceStatus = "over" | "under" | "on-target";

export interface Period {
  /** inclusive */
  start: Date;
  /** exclusive */
  end: Date;
}

export interface EntryInput {
  id: string;
  activityId: string;
  startedAt: Date;
  /** null means the timer is still running */
  endedAt: Date | null;
}

export interface WeightInput {
  activityId: string;
  categoryId: string;
  weightPercent: number;
}

export interface ActivityInput {
  id: string;
  name: string;
}

export interface CategoryInput {
  id: string;
  name: string;
  color: string;
  targetHoursPerWeek: number;
}

export interface CategoryBreakdownItem {
  activityId: string;
  activityName: string;
  hours: number;
}

export interface CategoryStat {
  categoryId: string;
  name: string;
  color: string;
  targetHours: number;
  actualHours: number;
  diffHours: number;
  diffPercent: number;
  status: BalanceStatus;
  breakdown: CategoryBreakdownItem[];
}

export interface TrendPoint {
  period: Period;
  actualHours: number;
  targetHours: number;
}

export interface CategoryTrend {
  categoryId: string;
  name: string;
  color: string;
  /** oldest first, current period last */
  points: TrendPoint[];
}

const ON_TARGET_EPSILON = 0.02; // within 2% of target counts as "on target"
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Length of a period expressed in fractional days. */
export function periodLengthDays(period: Period): number {
  return (period.end.getTime() - period.start.getTime()) / MS_PER_DAY;
}

/** Scale a category's weekly target to the given period length. */
export function categoryTargetForPeriod(category: Pick<CategoryInput, "targetHoursPerWeek">, period: Period): number {
  return category.targetHoursPerWeek * (periodLengthDays(period) / 7);
}

/** Hours of a single entry that overlap with the given period. */
function overlapHours(entry: EntryInput, period: Period, now: Date): number {
  const effectiveEnd = entry.endedAt ?? now;
  const start = entry.startedAt > period.start ? entry.startedAt : period.start;
  const end = effectiveEnd < period.end ? effectiveEnd : period.end;
  const ms = end.getTime() - start.getTime();
  return ms > 0 ? ms / MS_PER_HOUR : 0;
}

/** Sum entry durations per activity, clipped to the period. */
export function sumActivityHoursInPeriod(entries: EntryInput[], period: Period, now: Date): Map<string, number> {
  const result = new Map<string, number>();
  for (const entry of entries) {
    const hours = overlapHours(entry, period, now);
    if (hours <= 0) continue;
    result.set(entry.activityId, (result.get(entry.activityId) ?? 0) + hours);
  }
  return result;
}

/** Distribute each activity's hours across its categories proportionally to weightPercent. */
export function distributeToCategories(
  activityHours: Map<string, number>,
  weights: WeightInput[],
): Map<string, { hours: number; breakdown: { activityId: string; hours: number }[] }> {
  const result = new Map<string, { hours: number; breakdown: { activityId: string; hours: number }[] }>();
  for (const weight of weights) {
    const activityTotal = activityHours.get(weight.activityId);
    if (!activityTotal) continue;
    const hours = activityTotal * (weight.weightPercent / 100);
    if (hours <= 0) continue;
    const existing = result.get(weight.categoryId);
    if (existing) {
      existing.hours += hours;
      existing.breakdown.push({ activityId: weight.activityId, hours });
    } else {
      result.set(weight.categoryId, { hours, breakdown: [{ activityId: weight.activityId, hours }] });
    }
  }
  return result;
}

function statusFor(diffHours: number, targetHours: number): BalanceStatus {
  if (targetHours <= 0) return diffHours > 0 ? "over" : "on-target";
  const relDiff = Math.abs(diffHours) / targetHours;
  if (relDiff <= ON_TARGET_EPSILON) return "on-target";
  return diffHours > 0 ? "over" : "under";
}

/**
 * Core per-category stats for a single period: target vs actual hours (from the
 * weighted activity -> category distribution) and the deviation.
 */
export function computeCategoryStats(
  categories: CategoryInput[],
  activities: ActivityInput[],
  entries: EntryInput[],
  weights: WeightInput[],
  period: Period,
  now: Date,
): CategoryStat[] {
  const activityNames = new Map(activities.map((a) => [a.id, a.name]));
  const activityHours = sumActivityHoursInPeriod(entries, period, now);
  const categoryHours = distributeToCategories(activityHours, weights);

  return categories.map((category) => {
    const targetHours = categoryTargetForPeriod(category, period);
    const entry = categoryHours.get(category.id);
    const actualHours = entry?.hours ?? 0;
    const breakdown: CategoryBreakdownItem[] = (entry?.breakdown ?? [])
      .map((b) => ({
        activityId: b.activityId,
        activityName: activityNames.get(b.activityId) ?? "Unknown activity",
        hours: b.hours,
      }))
      .sort((a, b) => b.hours - a.hours);

    const diffHours = actualHours - targetHours;
    const diffPercent = targetHours > 0 ? (diffHours / targetHours) * 100 : actualHours > 0 ? 100 : 0;

    return {
      categoryId: category.id,
      name: category.name,
      color: category.color,
      targetHours,
      actualHours,
      diffHours,
      diffPercent,
      status: statusFor(diffHours, targetHours),
      breakdown,
    };
  });
}

/** Categories ranked by how far off target they are, most deviant first. */
export function rankByDeviation(stats: CategoryStat[]): CategoryStat[] {
  return [...stats].sort((a, b) => Math.abs(b.diffHours) - Math.abs(a.diffHours));
}

/** Resolve the period boundaries for a given kind + anchor date (or explicit custom range). */
export function resolvePeriod(kind: PeriodKind, anchor: Date, customFrom?: Date, customTo?: Date): Period {
  switch (kind) {
    case "day": {
      const start = startOfDay(anchor);
      return { start, end: addDays(start, 1) };
    }
    case "week": {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 7) };
    }
    case "month": {
      const start = startOfMonth(anchor);
      return { start, end: addMonths(start, 1) };
    }
    case "custom": {
      const start = startOfDay(customFrom ?? anchor);
      const end = addDays(startOfDay(customTo ?? anchor), 1);
      return { start, end: end > start ? end : addDays(start, 1) };
    }
  }
}

/** The immediately preceding period of the same kind/length, for rolling trend calculations. */
export function previousPeriod(period: Period, kind: PeriodKind): Period {
  switch (kind) {
    case "day":
      return { start: subDays(period.start, 1), end: period.start };
    case "week":
      return { start: subWeeks(period.start, 1), end: period.start };
    case "month":
      return { start: subMonths(period.start, 1), end: period.start };
    case "custom": {
      const durationMs = period.end.getTime() - period.start.getTime();
      return { start: new Date(period.start.getTime() - durationMs), end: period.start };
    }
  }
}

/** Build the list of periods for a rolling trend: oldest first, ending with `current`. */
export function buildTrendPeriods(current: Period, kind: PeriodKind, periodsBack: number): Period[] {
  const periods: Period[] = [current];
  for (let i = 0; i < periodsBack; i++) {
    periods.unshift(previousPeriod(periods[0], kind));
  }
  return periods;
}

/** Earliest timestamp needed to compute a trend covering `periodsBack` periods before `current`. */
export function earliestTrendStart(current: Period, kind: PeriodKind, periodsBack: number): Date {
  return buildTrendPeriods(current, kind, periodsBack)[0].start;
}

/**
 * Rolling per-category trend across the last `periodsBack + 1` periods (including the
 * current one), so the UI can render a lightweight bar/sparkline of actual vs target.
 */
export function computeCategoryTrends(
  categories: CategoryInput[],
  entries: EntryInput[],
  weights: WeightInput[],
  currentPeriod: Period,
  kind: PeriodKind,
  now: Date,
  periodsBack = 6,
): CategoryTrend[] {
  const periods = buildTrendPeriods(currentPeriod, kind, periodsBack);

  return categories.map((category) => {
    const points: TrendPoint[] = periods.map((period) => {
      const activityHours = sumActivityHoursInPeriod(entries, period, now);
      const actualHours = distributeToCategories(activityHours, weights).get(category.id)?.hours ?? 0;
      return { period, actualHours, targetHours: categoryTargetForPeriod(category, period) };
    });
    return { categoryId: category.id, name: category.name, color: category.color, points };
  });
}

// --- small local date helpers (avoid pulling in date-fns' startOf* which default to Monday/Sunday ambiguity) ---

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  // Monday-start week
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  return addDays(d, -diff);
}

function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
