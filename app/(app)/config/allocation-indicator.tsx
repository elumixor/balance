import { Badge } from "@/components/ui/badge";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";

const HOURS_PER_WEEK = 168;

export function AllocationIndicator({ totalHours }: { totalHours: number }) {
  const diff = HOURS_PER_WEEK - totalHours;
  const pct = Math.min((totalHours / HOURS_PER_WEEK) * 100, 100);
  const over = diff < 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Allocated {totalHours.toFixed(1)}h / {HOURS_PER_WEEK}h per week
        </span>
        <Badge variant={over ? "destructive" : Math.abs(diff) < 0.05 ? "default" : "secondary"}>
          {Math.abs(diff) < 0.05 ? "fully allocated" : over ? `${Math.abs(diff).toFixed(1)}h over` : `${diff.toFixed(1)}h under`}
        </Badge>
      </div>
      <Progress value={pct}>
        <ProgressTrack className={over ? "bg-destructive/20" : undefined}>
          <ProgressIndicator className={over ? "bg-destructive" : undefined} />
        </ProgressTrack>
      </Progress>
    </div>
  );
}
