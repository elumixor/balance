import { periodResolver } from "./period";
import type {
  ActivityInput,
  BalanceStatus,
  CategoryBreakdownItem,
  CategoryInput,
  CategoryStat,
  EntryInput,
  Period,
  WeightInput,
} from "./types";
import { MS_PER_HOUR } from "./types";

const ON_TARGET_EPSILON = 0.02; // within 2% of target counts as "on target"

type CategoryHours = { hours: number; breakdown: { activityId: string; hours: number }[] };

/** Computes per-category target-vs-actual hours for a period, from weighted activity entries. */
export class CategoryStatsCalculator {
  /**
   * Core per-category stats for a single period: target vs actual hours (from the
   * weighted activity -> category distribution) and the deviation.
   */
  compute(
    categories: CategoryInput[],
    activities: ActivityInput[],
    entries: EntryInput[],
    weights: WeightInput[],
    period: Period,
    now: Date,
  ): CategoryStat[] {
    const activityNames = new Map(activities.map((a) => [a.id, a.name]));
    const activityHours = this.sumActivityHoursInPeriod(entries, period, now);
    const categoryHours = this.distributeToCategories(activityHours, weights);

    return categories.map((category) => {
      const targetHours = periodResolver.targetForPeriod(category, period);
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
        status: this.statusFor(diffHours, targetHours),
        breakdown,
      };
    });
  }

  /** Categories ranked by how far off target they are, most deviant first. */
  rankByDeviation(stats: CategoryStat[]): CategoryStat[] {
    return [...stats].sort((a, b) => Math.abs(b.diffHours) - Math.abs(a.diffHours));
  }

  /** Sum entry durations per activity, clipped to the period. */
  sumActivityHoursInPeriod(entries: EntryInput[], period: Period, now: Date): Map<string, number> {
    const result = new Map<string, number>();
    for (const entry of entries) {
      const hours = this.overlapHours(entry, period, now);
      if (hours <= 0) continue;
      result.set(entry.activityId, (result.get(entry.activityId) ?? 0) + hours);
    }
    return result;
  }

  /** Distribute each activity's hours across its categories proportionally to weightPercent. */
  distributeToCategories(activityHours: Map<string, number>, weights: WeightInput[]): Map<string, CategoryHours> {
    const result = new Map<string, CategoryHours>();
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

  private statusFor(diffHours: number, targetHours: number): BalanceStatus {
    if (targetHours <= 0) return diffHours > 0 ? "over" : "on-target";
    const relDiff = Math.abs(diffHours) / targetHours;
    if (relDiff <= ON_TARGET_EPSILON) return "on-target";
    return diffHours > 0 ? "over" : "under";
  }

  /** Hours of a single entry that overlap with the given period. */
  private overlapHours(entry: EntryInput, period: Period, now: Date): number {
    const effectiveEnd = entry.endedAt ?? now;
    const start = entry.startedAt > period.start ? entry.startedAt : period.start;
    const end = effectiveEnd < period.end ? effectiveEnd : period.end;
    const ms = end.getTime() - start.getTime();
    return ms > 0 ? ms / MS_PER_HOUR : 0;
  }
}

export const categoryStatsCalculator = new CategoryStatsCalculator();
