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
import { createActivity, updateActivity } from "./actions";
import type { ActivityRow, CategoryRow } from "./types";

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
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(activity?.name ?? "");
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const w of activity?.weights ?? []) {
      initial[w.categoryId] = String(w.weightPercent);
    }
    return initial;
  });

  const total = categories.reduce((sum, c) => sum + (Number.parseFloat(weights[c.id]) || 0), 0);
  const isValid = total === 100;

  function reset() {
    setName(activity?.name ?? "");
    const initial: Record<string, string> = {};
    for (const w of activity?.weights ?? []) {
      initial[w.categoryId] = String(w.weightPercent);
    }
    setWeights(initial);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!isValid) {
      setError("Category weights must sum to exactly 100%");
      return;
    }
    setError(null);
    const input = {
      name: name.trim(),
      weights: categories
        .map((c) => ({ categoryId: c.id, weightPercent: Number.parseInt(weights[c.id] ?? "0", 10) }))
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{activity ? "Edit activity" : "New activity"}</DialogTitle>
          <DialogDescription>
            Distribute this activity across categories. Weights must add up to 100%.
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
            <Label>Category weights</Label>
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Create at least one category first.
              </p>
            )}
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {categories.map((category) => (
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
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <Badge variant={isValid ? "default" : "destructive"}>{total}%</Badge>
            </div>
            {!isValid && (
              <p className="text-sm text-destructive">Weights must sum to exactly 100% (currently {total}%).</p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isPending || !isValid || categories.length === 0}>
              {isPending ? "Saving..." : activity ? "Save changes" : "Create activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
