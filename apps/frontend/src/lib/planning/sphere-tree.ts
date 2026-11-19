import type { SphereProgress } from "./types";

/**
 * Spheres nest one level, and the server refuses anything deeper (`categories/tree.ts`,
 * `nestingRefusal`). What the screen needs of that rule is the list it offers, so nobody is shown a
 * choice the server would only turn down — and the arithmetic behind each sphere's bar.
 */

interface Nestable {
  id: string;
  parentId: string | null;
  isBuffer: boolean;
}

/**
 * The spheres `id` may be made a part of: any other top-level sphere but the Buffer — and none at
 * all while `id` holds parts of its own, since its parts would end up two levels down.
 */
export function parentOptions<T extends Nestable>(id: string, spheres: readonly T[]): T[] {
  if (spheres.some((sphere) => sphere.parentId === id)) return [];
  return spheres.filter((sphere) => sphere.id !== id && !sphere.isBuffer && sphere.parentId === null);
}

export interface Bar {
  /** Share of the bar already spent, 0..1. */
  tracked: number;
  /** Share still on the calendar, 0..1, drawn after `tracked`. */
  scheduled: number;
  /** Hours planned past the target; 0 when the week fits. */
  overHours: number;
  /** Tracked and scheduled together — what the week holds for this sphere. */
  plannedHours: number;
}

/**
 * A sphere's week as a bar against its target. Over the target the bar is full and the parts keep
 * their proportion, so a week planned half again over still reads as mostly spent or mostly ahead.
 */
export function barOf(progress: Pick<SphereProgress, "trackedHours" | "scheduledHours" | "targetHours">): Bar {
  const plannedHours = round(progress.trackedHours + progress.scheduledHours);
  const scale = Math.max(plannedHours, progress.targetHours);
  return {
    tracked: scale > 0 ? progress.trackedHours / scale : 0,
    scheduled: scale > 0 ? progress.scheduledHours / scale : 0,
    overHours: Math.max(0, round(plannedHours - progress.targetHours)),
    plannedHours,
  };
}

/**
 * The whole week: only the top-level spheres are summed, because a part's hours are already inside
 * its parent's and its target is a share of the parent's rather than more of the week.
 */
export function weekTotals(spheres: readonly SphereProgress[]): {
  trackedHours: number;
  scheduledHours: number;
  targetHours: number;
} {
  const tops = spheres.filter((sphere) => sphere.parentId === null);
  const sum = (pick: (sphere: SphereProgress) => number) => round(tops.reduce((total, s) => total + pick(s), 0));
  return {
    trackedHours: sum((s) => s.trackedHours),
    scheduledHours: sum((s) => s.scheduledHours),
    targetHours: sum((s) => s.targetHours),
  };
}

/** What the sphere's Keep link field accepts: a link, or empty to clear it. Null when it's neither. */
export function readLink(typed: string): { urn: string | null } | null {
  const value = typed.trim();
  if (value === "") return { urn: null };
  return /^(https:\/\/\S+|keep:page\/\S+)$/.test(value) ? { urn: value } : null;
}

const round = (hours: number) => Math.round(hours * 10) / 10;
