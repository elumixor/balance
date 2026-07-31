import { cn } from "@/lib/utils";
import type { CategoryTrend } from "./calculations";

function barColor(actual: number, target: number): string {
  if (target <= 0) return actual > 0 ? "bg-amber-500" : "bg-muted";
  const ratio = actual / target;
  if (ratio >= 0.98 && ratio <= 1.02) return "bg-emerald-500";
  return ratio > 1.02 ? "bg-amber-500" : "bg-blue-500";
}

/**
 * Lightweight rolling-average trend: one row per category, one bar per past period.
 * Bar height is actual/target (capped) so over/under-shoot is visible at a glance —
 * no charting library, just divs.
 */
export function TrendTable({ trends }: { trends: CategoryTrend[] }) {
  if (trends.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {trends.map((trend) => (
        <div key={trend.categoryId} className="flex items-center gap-3">
          <div className="flex w-32 shrink-0 items-center gap-2 text-sm">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: trend.color }} />
            <span className="truncate">{trend.name}</span>
          </div>
          <div className="flex flex-1 items-end gap-1.5">
            {trend.points.map((point, i) => {
              const ratio = point.targetHours > 0 ? point.actualHours / point.targetHours : point.actualHours > 0 ? 1 : 0;
              const heightPct = Math.max(6, Math.min(100, ratio * 100));
              const isCurrent = i === trend.points.length - 1;
              return (
                <div
                  key={point.period.start.toISOString()}
                  className="flex h-10 flex-1 flex-col justify-end"
                  title={`${point.period.start.toLocaleDateString()}: ${point.actualHours.toFixed(1)}h / ${point.targetHours.toFixed(1)}h`}
                >
                  <div
                    className={cn(
                      "w-full rounded-sm transition-all",
                      barColor(point.actualHours, point.targetHours),
                      isCurrent ? "opacity-100" : "opacity-50",
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
