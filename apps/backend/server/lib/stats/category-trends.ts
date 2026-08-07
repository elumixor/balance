import { categoryStatsCalculator } from "./category-stats";
import { periodResolver } from "./period";
import type { CategoryInput, CategoryTrend, EventInput, Period, PeriodKind, TrendPoint } from "./types";

const DEFAULT_PERIODS_BACK = 6;

/** Computes rolling per-category actual-vs-target trends for the Statistics screen's sparklines. */
export class CategoryTrendsCalculator {
  /**
   * Rolling per-category trend across the last `periodsBack + 1` periods (including the
   * current one), so the UI can render a lightweight bar/sparkline of actual vs target.
   */
  compute(
    categories: CategoryInput[],
    events: EventInput[],
    currentPeriod: Period,
    kind: PeriodKind,
    periodsBack = DEFAULT_PERIODS_BACK,
  ): CategoryTrend[] {
    const periods = periodResolver.buildTrendPeriods(currentPeriod, kind, periodsBack);
    const hoursByPeriod = periods.map((period) => categoryStatsCalculator.accumulate(events, period));

    return categories.map((category) => {
      const points: TrendPoint[] = periods.map((period, index) => ({
        period,
        actualHours: hoursByPeriod[index].get(category.id)?.hours ?? 0,
        targetHours: periodResolver.targetForPeriod(category, period),
      }));
      return { categoryId: category.id, name: category.name, color: category.color, points };
    });
  }
}

export const categoryTrendsCalculator = new CategoryTrendsCalculator();
