import { ApiError } from "~/lib/http/api-error";
import { categoryStatsCalculator } from "./category-stats";
import { categoryTrendsCalculator } from "./category-trends";
import { periodResolver } from "./period";
import { StatsRepository } from "./queries";
import type { PeriodKind } from "./types";

/** How many periods before the current one a trend line reaches back. */
const TREND_PERIODS_BACK = 6;

const PERIOD_KINDS = ["day", "week", "month"] as const;
type RequestedPeriod = (typeof PERIOD_KINDS)[number];

/** The Statistics screen's whole answer: the ring for one period, ranked, and the trend behind it. */
export class StatsService {
  constructor(private readonly userId: string) {}

  async stats(input: { period: string; date?: string }) {
    const kind = parsePeriodKind(input.period);
    const anchor = input.date ? new Date(input.date) : new Date();
    if (Number.isNaN(anchor.getTime())) throw new ApiError("date must be a valid ISO 8601 string");

    const period = periodResolver.resolve(kind, anchor);
    const trendPeriods = periodResolver.buildTrendPeriods(period, kind, TREND_PERIODS_BACK);
    const rangeStart = periodResolver.earliestTrendStart(period, kind, TREND_PERIODS_BACK);

    const data = await new StatsRepository(this.userId).get(rangeStart, period.end);

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
        icon: s.icon,
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
  }
}

function parsePeriodKind(value: string): PeriodKind & RequestedPeriod {
  const kind = PERIOD_KINDS.find((one) => one === value);
  if (!kind) throw new ApiError(`period must be one of ${PERIOD_KINDS.join(", ")}`);
  return kind;
}
