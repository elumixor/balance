"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCategory, updateCategory } from "./actions";
import { AllocationIndicator } from "./allocation-indicator";
import type { CategoryRow } from "./types";

export function CategoryDialog({
  trigger,
  category,
  allCategories,
}: {
  trigger: ReactNode;
  category?: CategoryRow;
  allCategories: CategoryRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? "#6366f1");
  const [target, setTarget] = useState(category?.targetHoursPerWeek ?? "1");
  const [trackingMode, setTrackingMode] = useState<"consistency" | "average">(
    category?.trackingMode ?? "average",
  );
  const [isProductiveLoad, setIsProductiveLoad] = useState(category?.isProductiveLoad ?? false);

  const otherTotal = allCategories
    .filter((c) => c.id !== category?.id)
    .reduce((sum, c) => sum + Number(c.targetHoursPerWeek), 0);
  const liveTotal = otherTotal + (Number.parseFloat(target) || 0);

  function reset() {
    setName(category?.name ?? "");
    setColor(category?.color ?? "#6366f1");
    setTarget(category?.targetHoursPerWeek ?? "1");
    setTrackingMode(category?.trackingMode ?? "average");
    setIsProductiveLoad(category?.isProductiveLoad ?? false);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetHoursPerWeek = Number.parseFloat(target);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (Number.isNaN(targetHoursPerWeek) || targetHoursPerWeek < 0) {
      setError("Target hours must be a non-negative number");
      return;
    }
    setError(null);
    const input = { name: name.trim(), color, targetHoursPerWeek, trackingMode, isProductiveLoad };
    startTransition(async () => {
      try {
        if (category) {
          await updateCategory(category.id, input);
        } else {
          await createCategory(input);
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
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            Categories are the life-allocation buckets your activities feed into.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sleep"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="category-color">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="category-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                />
                <Input value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category-target">Target hours / week</Label>
              <Input
                id="category-target"
                type="number"
                min={0}
                step={0.5}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                {((Number.parseFloat(target) || 0) / 168 * 100).toFixed(1)}% of the week
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="category-mode">Tracking mode</Label>
              <Select
                value={trackingMode}
                onValueChange={(v) => setTrackingMode(v as "consistency" | "average")}
              >
                <SelectTrigger id="category-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consistency">Consistency</SelectItem>
                  <SelectItem value="average">Average</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end pb-1.5">
              <Label className="gap-2">
                <Checkbox
                  checked={isProductiveLoad}
                  onCheckedChange={(v) => setIsProductiveLoad(v === true)}
                />
                Productive load
              </Label>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <AllocationIndicator totalHours={liveTotal} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : category ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
