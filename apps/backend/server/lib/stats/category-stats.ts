import { periodResolver } from "./period";
import type { BalanceStatus, CategoryBreakdownItem, CategoryInput, CategoryStat, EventInput, Period } from "./types";
import { MS_PER_HOUR } from "./types";

const ON_TARGET_EPSILON = 0.02; // within 2% of target counts as "on target"

type CategoryHours = { hours: number; breakdown: Map<string, CategoryBreakdownItem> };

/** Computes per-category target-vs-actual hours for a period, from the mapped calendar events. */
export class CategoryStatsCalculator {
  compute(categories: CategoryInput[], events: EventInput[], period: Period): CategoryStat[] {
    const categoryHours = this.accumulate(events, period);

    return categories.map((category) => {
      const targetHours = periodResolver.targetForPeriod(category, period);
      const hit = categoryHours.get(category.id);
      const actualHours = hit?.hours ?? 0;
      const breakdown = [...(hit?.breakdown.values() ?? [])].sort((a, b) => b.hours - a.hours);

      const diffHours = actualHours - targetHours;
      const diffPercent = targetHours > 0 ? (diffHours / targetHours) * 100 : actualHours > 0 ? 100 : 0;

      return {
        categoryId: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        isBuffer: category.isBuffer,
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

  /** Splits every event's hours across the categories it counts toward, clipped to the period. */
  accumulate(events: EventInput[], period: Period): Map<string, CategoryHours> {
    const result = new Map<string, CategoryHours>();

    for (const event of events) {
      const eventHours = this.overlapHours(event, period);
      if (eventHours <= 0) continue;

      for (const weight of event.weights) {
        const hours = eventHours * (weight.weightPercent / 100);
        if (hours <= 0) continue;

        const category = result.get(weight.categoryId) ?? { hours: 0, breakdown: new Map() };
        category.hours += hours;
        const existing = category.breakdown.get(event.source.id);
        if (existing) existing.hours += hours;
        else
          category.breakdown.set(event.source.id, {
            activityId: event.source.id,
            activityName: event.source.name,
            hours,
          });
        result.set(weight.categoryId, category);
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

  /** Clipping to the period is also what makes multi-day and week-crossing events come out right. */
  private overlapHours(event: EventInput, period: Period): number {
    const start = event.startedAt > period.start ? event.startedAt : period.start;
    const end = event.endedAt < period.end ? event.endedAt : period.end;
    const ms = end.getTime() - start.getTime();
    return ms > 0 ? ms / MS_PER_HOUR : 0;
  }
}

export const categoryStatsCalculator = new CategoryStatsCalculator();
