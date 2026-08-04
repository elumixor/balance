import { categoryStatsCalculator } from "./category-stats";
import { periodResolver } from "./period";
import type { CategoryInput, CategoryTrend, EntryInput, Period, PeriodKind, TrendPoint, WeightInput } from "./types";

const DEFAULT_PERIODS_BACK = 6;

/** Computes rolling per-category actual-vs-target trends for the Statistics screen's sparklines. */
export class CategoryTrendsCalculator {
  /**
   * Rolling per-category trend across the last `periodsBack + 1` periods (including the
   * current one), so the UI can render a lightweight bar/sparkline of actual vs target.
   */
  compute(
    categories: CategoryInput[],
    entries: EntryInput[],
    weights: WeightInput[],
    currentPeriod: Period,
    kind: PeriodKind,
    now: Date,
    periodsBack = DEFAULT_PERIODS_BACK,
  ): CategoryTrend[] {
    const periods = periodResolver.buildTrendPeriods(currentPeriod, kind, periodsBack);

    return categories.map((category) => {
      const points: TrendPoint[] = periods.map((period) => {
        const activityHours = categoryStatsCalculator.sumActivityHoursInPeriod(entries, period, now);
        const actualHours =
          categoryStatsCalculator.distributeToCategories(activityHours, weights).get(category.id)?.hours ?? 0;
        return { period, actualHours, targetHours: periodResolver.targetForPeriod(category, period) };
      });
      return { categoryId: category.id, name: category.name, color: category.color, points };
    });
  }
}

export const categoryTrendsCalculator = new CategoryTrendsCalculator();
