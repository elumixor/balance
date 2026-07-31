import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  buildTrendPeriods,
  computeCategoryStats,
  computeCategoryTrends,
  earliestTrendStart,
  rankByDeviation,
  resolvePeriod,
  type PeriodKind,
} from "@/app/(app)/stats/calculations";
import { getStatsData } from "@/app/(app)/stats/queries";
import { jsonError, requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

const TREND_PERIODS_BACK = 6;

function parsePeriodKind(value: string | null): PeriodKind | null {
  if (value === "day" || value === "week" || value === "month") return value;
  return null;
}

/**
 * GET /api/mobile/stats?period=day|week|month&date=ISO
 * Per-category actual/target/diff/trackingMode for the resolved period, ranked by
 * deviation, plus a 7-period rolling trend per category - same semantics as the web
 * Stats page (app/(app)/stats).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireDbUser();
  if (error) return error;

  const kind = parsePeriodKind(req.nextUrl.searchParams.get("period"));
  if (!kind) return jsonError("period must be one of day, week, month");

  const dateParam = req.nextUrl.searchParams.get("date");
  const anchor = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(anchor.getTime())) return jsonError("date must be a valid ISO 8601 string");

  const now = new Date();
  const period = resolvePeriod(kind, anchor);
  const trendPeriods = buildTrendPeriods(period, kind, TREND_PERIODS_BACK);
  const rangeStart = earliestTrendStart(period, kind, TREND_PERIODS_BACK);

  const data = await getStatsData(user.id, rangeStart, period.end);

  const stats = computeCategoryStats(data.categories, data.activities, data.entries, data.weights, period, now);
  const ranked = rankByDeviation(stats);
  const trends = computeCategoryTrends(data.categories, data.entries, data.weights, period, kind, now, TREND_PERIODS_BACK);

  return NextResponse.json({
    period: { start: period.start.toISOString(), end: period.end.toISOString(), kind },
    categories: ranked.map((s) => ({
      categoryId: s.categoryId,
      name: s.name,
      color: s.color,
      trackingMode: s.trackingMode,
      isProductiveLoad: s.isProductiveLoad,
      targetHours: s.targetHours,
      actualHours: s.actualHours,
      diffHours: s.diffHours,
      diffPercent: s.diffPercent,
      status: s.status,
      breakdown: s.breakdown,
      dailyConsistency: s.dailyConsistency?.map((d) => ({
        date: d.date.toISOString(),
        actualHours: d.actualHours,
        targetHours: d.targetHours,
        hit: d.hit,
      })) ?? null,
      daysHit: s.daysHit,
      daysTotal: s.daysTotal,
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
  });
}
