"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PieSplitEditor } from "@/components/pie-split-editor";
import { createActivity, updateActivity } from "./actions";
import type { ActivityRow, CategoryRow } from "./types";

const FREE_TIME_COLOR = "#3f3f46";

export function ActivityDialog({
  trigger,
  activity,
  categories,
}: {
  trigger: ReactNode;
  activity?: ActivityRow;
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const realCategories = categories.filter((c) => !c.isBuffer);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(activity?.name ?? "");
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const w of activity?.weights ?? []) {
      const category = categories.find((c) => c.id === w.categoryId);
      if (category && !category.isBuffer) initial[w.categoryId] = String(w.weightPercent);
    }
    return initial;
  });

  const explicitTotal = realCategories.reduce((sum, c) => sum + (Number.parseFloat(weights[c.id]) || 0), 0);
  const freeTime = Math.max(0, 100 - explicitTotal);
  const isValid = explicitTotal <= 100;

  const pieSegments = [
    ...realCategories.map((c) => ({
      id: c.id,
      label: c.name,
      color: c.color,
      value: Number.parseFloat(weights[c.id]) || 0,
    })),
    { id: "__free__", label: "Free time (Rest + Buffer)", color: FREE_TIME_COLOR, value: freeTime },
  ];

  function reset() {
    setName(activity?.name ?? "");
    const initial: Record<string, string> = {};
    for (const w of activity?.weights ?? []) {
      const category = categories.find((c) => c.id === w.categoryId);
      if (category && !category.isBuffer) initial[w.categoryId] = String(w.weightPercent);
    }
    setWeights(initial);
    setError(null);
  }

  function handlePieChange(values: number[]) {
    // Last value is the implicit "free time" slice — never persisted directly.
    setWeights((prev) => {
      const next = { ...prev };
      realCategories.forEach((c, i) => {
        next[c.id] = String(values[i]);
      });
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!isValid) {
      setError("Category weights can't add up to more than 100%");
      return;
    }
    setError(null);
    const input = {
      name: name.trim(),
      weights: realCategories
        .map((c) => ({ categoryId: c.id, weightPercent: Math.round(Number.parseFloat(weights[c.id]) || 0) }))
        .filter((w) => w.weightPercent > 0),
    };
    startTransition(async () => {
      try {
        if (activity) {
          await updateActivity(activity.id, input);
        } else {
          await createActivity(input);
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{activity ? "Edit activity" : "New activity"}</DialogTitle>
          <DialogDescription>
            Distribute this activity across categories. Whatever isn&apos;t assigned counts as free time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="activity-name">Name</Label>
            <Input
              id="activity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gym"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Category split</Label>
            {realCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Create at least one category first.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <PieSplitEditor
                  segments={pieSegments.map((s) => ({ ...s, locked: s.id === "__free__" }))}
                  onChange={handlePieChange}
                  size={168}
                  thickness={30}
                />
                <div className="flex min-w-40 flex-1 flex-col gap-2">
                  {realCategories.map((category) => (
                    <div key={category.id} className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="flex-1 truncate text-sm">{category.name}</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="w-20"
                        value={weights[category.id] ?? ""}
                        onChange={(e) =>
                          setWeights((prev) => ({ ...prev, [category.id]: e.target.value }))
                        }
                        placeholder="0"
                      />
                      <span className="w-4 text-sm text-muted-foreground">%</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: FREE_TIME_COLOR }} />
                    <span className="flex-1">Free time</span>
                    <Badge variant={isValid ? "secondary" : "destructive"}>{freeTime}%</Badge>
                  </div>
                </div>
              </div>
            )}
            {!isValid && (
              <p className="text-sm text-destructive">
                Category weights can&apos;t add up to more than 100% (currently {explicitTotal}%).
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isPending || !isValid || realCategories.length === 0}>
              {isPending ? "Saving..." : activity ? "Save changes" : "Create activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
