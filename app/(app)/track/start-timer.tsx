"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startTimer } from "./actions";
import { PlayIcon } from "lucide-react";

type ActivityRef = { id: string; name: string };

export function StartTimer({
  recentActivities,
  frequentActivities,
  allActivities,
  hasRunning,
}: {
  recentActivities: ActivityRef[];
  frequentActivities: ActivityRef[];
  allActivities: ActivityRef[];
  hasRunning: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectValue, setSelectValue] = useState("");

  const start = (activityId: string | null) => {
    if (!activityId) return;
    startTransition(() => startTimer(activityId));
  };

  const startFromSelect = (activityId: string | null) => {
    start(activityId);
    setSelectValue("");
  };

  return (
    <div className="flex flex-col gap-4">
      {recentActivities.length > 0 && (
        <QuickList label="Recent" activities={recentActivities} onStart={start} disabled={isPending} />
      )}
      {frequentActivities.length > 0 && (
        <QuickList
          label="Frequent (30d)"
          activities={frequentActivities}
          onStart={start}
          disabled={isPending}
        />
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {hasRunning ? "Switch to" : "Start"}
        </span>
        <Select value={selectValue} onValueChange={startFromSelect} disabled={isPending}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose an activity…" />
          </SelectTrigger>
          <SelectContent>
            {allActivities.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function QuickList({
  label,
  activities,
  onStart,
  disabled,
}: {
  label: string;
  activities: ActivityRef[];
  onStart: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {activities.map((a) => (
          <Button
            key={a.id}
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onStart(a.id)}
          >
            <PlayIcon />
            {a.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
