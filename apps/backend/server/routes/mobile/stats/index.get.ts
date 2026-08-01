import { getQuery } from "h3";
import { ApiError } from "../../../lib/api-error";
import {
  buildTrendPeriods,
  computeCategoryStats,
  computeCategoryTrends,
  earliestTrendStart,
  rankByDeviation,
  resolvePeriod,
  type PeriodKind,
} from "../../../lib/stats/calculations";
import { getStatsData } from "../../../lib/stats/queries";
import { getDbUserForRequest } from "../../../lib/current-user";
import { defineApiHandler } from "../../../lib/handler";

const TREND_PERIODS_BACK = 6;

function parsePeriodKind(value: unknown): PeriodKind | null {
  if (value === "day" || value === "week" || value === "month") return value;
  return null;
}

export default defineApiHandler(async (event) => {
  const user = await getDbUserForRequest(event);
  const query = getQuery(event);

  const kind = parsePeriodKind(query.period);
  if (!kind) throw new ApiError("period must be one of day, week, month");

  const dateParam = typeof query.date === "string" ? query.date : undefined;
  const anchor = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(anchor.getTime())) throw new ApiError("date must be a valid ISO 8601 string");

  const now = new Date();
  const period = resolvePeriod(kind, anchor);
  const trendPeriods = buildTrendPeriods(period, kind, TREND_PERIODS_BACK);
  const rangeStart = earliestTrendStart(period, kind, TREND_PERIODS_BACK);

  const data = await getStatsData(user.id, rangeStart, period.end);

  const stats = computeCategoryStats(data.categories, data.activities, data.entries, data.weights, period, now);
  const ranked = rankByDeviation(stats);
  const trends = computeCategoryTrends(data.categories, data.entries, data.weights, period, kind, now, TREND_PERIODS_BACK);

  return {
    period: { start: period.start.toISOString(), end: period.end.toISOString(), kind },
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
});
