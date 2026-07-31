import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { CategoryStat } from "./calculations";

function fmtHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

function statusBadge(status: CategoryStat["status"]) {
  if (status === "on-target") return <Badge variant="secondary">On target</Badge>;
  if (status === "over") return <Badge className="bg-amber-500/20 text-amber-400">Over</Badge>;
  return <Badge className="bg-blue-500/20 text-blue-400">Under</Badge>;
}

export function CategoryStatCard({ stat }: { stat: CategoryStat }) {
  const pct = stat.targetHours > 0 ? Math.min(200, (stat.actualHours / stat.targetHours) * 100) : stat.actualHours > 0 ? 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stat.color }} />
          <CardTitle className="text-base">{stat.name}</CardTitle>
          <Badge variant="outline" className="capitalize">
            {stat.trackingMode}
          </Badge>
        </div>
        {statusBadge(stat.status)}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-2xl font-semibold tabular-nums">{fmtHours(stat.actualHours)}</span>
          <span className="text-muted-foreground">target {fmtHours(stat.targetHours)}</span>
        </div>

        <Progress
          value={Math.min(100, pct)}
          className={cn(
            "[&_[data-slot=progress-indicator]]:bg-blue-500",
            stat.status === "over" && "[&_[data-slot=progress-indicator]]:bg-amber-500",
            stat.status === "on-target" && "[&_[data-slot=progress-indicator]]:bg-emerald-500",
          )}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {stat.diffHours >= 0 ? "+" : ""}
            {fmtHours(stat.diffHours)} ({stat.diffPercent >= 0 ? "+" : ""}
            {stat.diffPercent.toFixed(0)}%)
          </span>
          {stat.isProductiveLoad && <span>productive load</span>}
        </div>

        {stat.dailyConsistency && (
          <div className="flex flex-col gap-1.5 border-t pt-2">
            <span className="text-xs text-muted-foreground">
              Consistency: {stat.daysHit}/{stat.daysTotal} days hit target
            </span>
            <div className="flex gap-1">
              {stat.dailyConsistency.map((day) => (
                <div
                  key={day.date.toISOString()}
                  title={`${day.date.toLocaleDateString()}: ${fmtHours(day.actualHours)} / ${fmtHours(day.targetHours)}`}
                  className={cn(
                    "h-4 flex-1 rounded-sm",
                    day.hit ? "bg-emerald-500" : "bg-muted-foreground/20",
                  )}
                />
              ))}
            </div>
          </div>
        )}

        {stat.breakdown.length > 0 && (
          <div className="flex flex-col gap-1 border-t pt-2 text-xs">
            {stat.breakdown.map((b) => (
              <div key={b.activityId} className="flex items-center justify-between text-muted-foreground">
                <span>{b.activityName}</span>
                <span className="tabular-nums">{fmtHours(b.hours)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
