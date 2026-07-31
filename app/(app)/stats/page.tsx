import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrCreateDbUser } from "@/lib/current-user";
import { CategoryStatCard } from "./category-stat-card";
import {
  computeCategoryStats,
  computeCategoryTrends,
  earliestTrendStart,
  type PeriodKind,
  rankByDeviation,
  resolvePeriod,
} from "./calculations";
import { PeriodSelector } from "./period-selector";
import { getStatsData } from "./queries";
import { TrendTable } from "./trend-table";

const TREND_PERIODS_BACK = 6;

function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kind: PeriodKind = (["day", "week", "month", "custom"] as const).includes(params.period as PeriodKind)
    ? (params.period as PeriodKind)
    : "week";

  const now = new Date();
  const anchor = parseDateParam(params.date as string) ?? now;
  const customFrom = parseDateParam(params.from as string) ?? anchor;
  const customTo = parseDateParam(params.to as string) ?? anchor;

  const period = resolvePeriod(kind, anchor, customFrom, customTo);
  const rangeStart = earliestTrendStart(period, kind, TREND_PERIODS_BACK);

  const user = await getOrCreateDbUser();
  const data = await getStatsData(user.id, rangeStart, period.end > now ? period.end : now);

  const stats = computeCategoryStats(data.categories, data.activities, data.entries, data.weights, period, now);
  const ranked = rankByDeviation(stats);
  const trends = computeCategoryTrends(data.categories, data.entries, data.weights, period, kind, now, TREND_PERIODS_BACK);

  const periodLabel = `${period.start.toLocaleDateString()} – ${new Date(period.end.getTime() - 1).toLocaleDateString()}`;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Statistics</h1>
          <p className="text-sm text-muted-foreground">Plan vs. fact for {periodLabel}</p>
        </div>
        <PeriodSelector kind={kind} anchor={anchor} customFrom={customFrom} customTo={customTo} />
      </div>

      {data.categories.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No categories yet — add some in Config to see stats here.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Balance overview</h2>
            <p className="text-sm text-muted-foreground">
              Categories sorted by how far they are from target, most deviant first.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {ranked.map((stat) => (
                <CategoryStatCard key={stat.categoryId} stat={stat} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <Card>
              <CardHeader>
                <CardTitle>Rolling trend</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Last {TREND_PERIODS_BACK + 1} {kind === "custom" ? "ranges" : `${kind}s`}, current period on the right.
                  Bar height is actual ÷ target.
                </p>
              </CardHeader>
              <CardContent>
                <TrendTable trends={trends} />
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
