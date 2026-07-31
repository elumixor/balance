"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDuration } from "./format";
import { stopTimer } from "./actions";
import { SquareIcon } from "lucide-react";

export function NowTracking({
  activityName,
  startedAt,
}: {
  activityName: string;
  startedAt: string;
}) {
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(startedAt).getTime());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();
    const tick = () => setElapsed(Date.now() - startMs);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <Card className="border-primary/30 ring-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Now tracking</span>
          <span className="inline-flex size-2 animate-pulse rounded-full bg-primary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">{activityName}</p>
          <p className="font-mono text-2xl tabular-nums text-muted-foreground">
            {formatDuration(elapsed)}
          </p>
        </div>
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() => startTransition(() => stopTimer())}
        >
          <SquareIcon />
          Stop
        </Button>
      </CardContent>
    </Card>
  );
}
