import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { categoryStatsCalculator } from "../../../lib/stats/category-stats";
import { categoryTrendsCalculator } from "../../../lib/stats/category-trends";
import { periodResolver } from "../../../lib/stats/period";
import { StatsRepository } from "../../../lib/stats/queries";
import type { PeriodKind } from "../../../lib/stats/types";

const TREND_PERIODS_BACK = 6;

export default handler({ query: { period: z.string(), date: z.string().optional() } }, async ({ query, event }) => {
  const user = await getDbUserForRequest(event);

  try {
    const kind = parsePeriodKind(query.period);
    if (!kind) throw new ApiError("period must be one of day, week, month");

    const anchor = query.date ? new Date(query.date) : new Date();
    if (Number.isNaN(anchor.getTime())) throw new ApiError("date must be a valid ISO 8601 string");

    const period = periodResolver.resolve(kind, anchor);
    const trendPeriods = periodResolver.buildTrendPeriods(period, kind, TREND_PERIODS_BACK);
    const rangeStart = periodResolver.earliestTrendStart(period, kind, TREND_PERIODS_BACK);

    const data = await new StatsRepository(user.id).get(rangeStart, period.end);

    const stats = categoryStatsCalculator.compute(data.categories, data.events, period);
    const ranked = categoryStatsCalculator.rankByDeviation(stats);
    const trends = categoryTrendsCalculator.compute(data.categories, data.events, period, kind, TREND_PERIODS_BACK);

    return {
      period: { start: period.start.toISOString(), end: period.end.toISOString(), kind },
      connected: data.connected,
      needsReconnect: data.needsReconnect,
      categories: ranked.map((s) => ({
        categoryId: s.categoryId,
        name: s.name,
        color: s.color,
        targetHours: s.targetHours,
        actualHours: s.actualHours,
        diffHours: s.diffHours,
        diffPercent: s.diffPercent,
        status: s.status,
        breakdown: s.breakdown,
      })),
      trends: trends.map((t) => ({
        categoryId: t.categoryId,
        name: t.name,
        color: t.color,
        points: t.points.map((p) => ({
          periodStart: p.period.start.toISOString(),
          periodEnd: p.period.end.toISOString(),
          actualHours: p.actualHours,
          targetHours: p.targetHours,
        })),
      })),
      trendPeriodCount: trendPeriods.length,
    };
  } catch (e) {
    return handleApiError(event, e);
  }
});

function parsePeriodKind(value: string): PeriodKind | null {
  if (value === "day" || value === "week" || value === "month") return value;
  return null;
}
