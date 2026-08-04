import { addDays, addMonths, subDays, subMonths, subWeeks } from "date-fns";
import { type CategoryInput, MS_PER_DAY, type Period, type PeriodKind } from "./types";

/**
 * Resolves period boundaries (day/week/month/custom) and builds rolling trend windows.
 * Uses small local date helpers instead of date-fns' startOf* to avoid Monday/Sunday ambiguity.
 */
export class PeriodResolver {
  /** Length of a period expressed in fractional days. */
  lengthDays(period: Period): number {
    return (period.end.getTime() - period.start.getTime()) / MS_PER_DAY;
  }

  /** Scale a category's weekly target to the given period length. */
  targetForPeriod(category: Pick<CategoryInput, "targetHoursPerWeek">, period: Period): number {
    return category.targetHoursPerWeek * (this.lengthDays(period) / 7);
  }

  /** Resolve the period boundaries for a given kind + anchor date (or explicit custom range). */
  resolve(kind: PeriodKind, anchor: Date, customFrom?: Date, customTo?: Date): Period {
    switch (kind) {
      case "day": {
        const start = this.startOfDay(anchor);
        return { start, end: addDays(start, 1) };
      }
      case "week": {
        const start = this.startOfWeek(anchor);
        return { start, end: addDays(start, 7) };
      }
      case "month": {
        const start = this.startOfMonth(anchor);
        return { start, end: addMonths(start, 1) };
      }
      case "custom": {
        const start = this.startOfDay(customFrom ?? anchor);
        const end = addDays(this.startOfDay(customTo ?? anchor), 1);
        return { start, end: end > start ? end : addDays(start, 1) };
      }
    }
  }

  /** The immediately preceding period of the same kind/length, for rolling trend calculations. */
  previous(period: Period, kind: PeriodKind): Period {
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
  buildTrendPeriods(current: Period, kind: PeriodKind, periodsBack: number): Period[] {
    const periods: Period[] = [current];
    for (let i = 0; i < periodsBack; i++) {
      periods.unshift(this.previous(periods[0], kind));
    }
    return periods;
  }

  /** Earliest timestamp needed to compute a trend covering `periodsBack` periods before `current`. */
  earliestTrendStart(current: Period, kind: PeriodKind, periodsBack: number): Date {
    return this.buildTrendPeriods(current, kind, periodsBack)[0].start;
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private startOfWeek(date: Date): Date {
    // Monday-start week
    const d = this.startOfDay(date);
    const day = d.getDay(); // 0 = Sunday
    const diff = (day + 6) % 7; // days since Monday
    return addDays(d, -diff);
  }

  private startOfMonth(date: Date): Date {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

export const periodResolver = new PeriodResolver();
