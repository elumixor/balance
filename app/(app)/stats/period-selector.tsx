"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PeriodKind } from "./calculations";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function PeriodSelector({
  kind,
  anchor,
  customFrom,
  customTo,
}: {
  kind: PeriodKind;
  anchor: Date;
  customFrom: Date;
  customTo: Date;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setKind(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    router.push(`?${params.toString()}`);
  }

  function shiftAnchor(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    const next = new Date(anchor);
    next.setDate(next.getDate() + days);
    params.set("date", toDateInputValue(next));
    router.push(`?${params.toString()}`);
  }

  function setCustomRange(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", "custom");
    params.set("from", from);
    params.set("to", to);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <Tabs value={kind} onValueChange={(v) => setKind(v as string)}>
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
      </Tabs>

      {kind !== "custom" ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftAnchor(kind === "day" ? -1 : kind === "week" ? -7 : -30)}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
          >
            ← Prev
          </button>
          <span className="text-sm text-muted-foreground">{toDateInputValue(anchor)}</span>
          <button
            type="button"
            onClick={() => shiftAnchor(kind === "day" ? 1 : kind === "week" ? 7 : 30)}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
          >
            Next →
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="from-date" className="text-xs">
              From
            </Label>
            <Input
              id="from-date"
              type="date"
              defaultValue={toDateInputValue(customFrom)}
              className="h-8 w-40"
              onChange={(e) => setCustomRange(e.target.value, toDateInputValue(customTo))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to-date" className="text-xs">
              To
            </Label>
            <Input
              id="to-date"
              type="date"
              defaultValue={toDateInputValue(customTo)}
              className="h-8 w-40"
              onChange={(e) => setCustomRange(toDateInputValue(customFrom), e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
