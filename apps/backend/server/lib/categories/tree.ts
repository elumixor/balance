import { type Span, sharedDurations } from "~/lib/stats/overlap";

/**
 * Spheres nest one level: a project under Projects, with hours a week of its own. Everything that
 * follows from that is here, pure — who is a slice of the ring, where a part's hours also count,
 * whether the parts ask for more than the whole, and how a week is going against each.
 */

const HOUR_MS = 3_600_000;

export interface SphereNode {
  readonly id: string;
  readonly parentId: string | null;
}

export interface SphereBudget extends SphereNode {
  readonly name: string;
  readonly targetHoursPerWeek: number;
}

export interface Weight {
  readonly categoryId: string;
  readonly weightPercent: number;
}

/** The slices of the ring: a part is drawn inside its parent's row, never beside it. */
export function topLevel<T extends SphereNode>(spheres: readonly T[]): T[] {
  return spheres.filter((sphere) => sphere.parentId === null);
}

export function parentsOf(spheres: readonly SphereNode[]): Map<string, string> {
  return new Map(spheres.flatMap((sphere) => (sphere.parentId ? [[sphere.id, sphere.parentId] as const] : [])));
}

/**
 * The same weights said in slices of the ring: a part's share goes to its parent, and two shares
 * that land on one sphere become one. What the ring, the planning hours and the watch count with.
 */
export function rollUp<T extends Weight>(weights: readonly T[], parents: ReadonlyMap<string, string>): T[] {
  const merged = new Map<string, T>();
  for (const weight of weights) {
    const categoryId = parents.get(weight.categoryId) ?? weight.categoryId;
    const existing = merged.get(categoryId);
    merged.set(categoryId, {
      ...weight,
      categoryId,
      weightPercent: (existing?.weightPercent ?? 0) + weight.weightPercent,
    });
  }
  return [...merged.values()];
}

/**
 * A list of spheres and the events filed against them, seen as the ring sees them: only the
 * slices, each event's parts counted as their parents. What stats and planning read.
 */
export function asRing<S extends SphereNode, E extends { readonly weights: readonly Weight[] }>(
  spheres: readonly S[],
  events: readonly E[],
): { spheres: S[]; events: E[] } {
  const parents = parentsOf(spheres);
  if (parents.size === 0) return { spheres: [...spheres], events: [...events] };
  return {
    spheres: topLevel(spheres),
    events: events.map((event) => ({ ...event, weights: rollUp(event.weights, parents) })),
  };
}

/**
 * Each sphere's name as somebody outside the app reads it: a part carries its parent's in front
 * ("Projects › Balance"), so two projects called "Admin" under different spheres stay apart.
 */
export function qualifiedNames(spheres: readonly (SphereNode & { readonly name: string })[]): Map<string, string> {
  const names = new Map(spheres.map((sphere) => [sphere.id, sphere.name]));
  return new Map(
    spheres.map((sphere) => {
      const parent = sphere.parentId ? names.get(sphere.parentId) : undefined;
      return [sphere.id, parent ? `${parent} › ${sphere.name}` : sphere.name];
    }),
  );
}

export type NestingRefusal = "self" | "missing" | "buffer" | "nested" | "has-parts";

const REFUSALS: Record<NestingRefusal, string> = {
  self: "A sphere can't be a part of itself.",
  missing: "The parent sphere doesn't exist.",
  buffer: "The Buffer can't hold parts.",
  nested: "Spheres nest one level: the parent is itself a part of another sphere.",
  "has-parts": "A sphere that holds parts can't become a part of another.",
};

export function refusalText(refusal: NestingRefusal): string {
  return REFUSALS[refusal];
}

/**
 * Why `id` can't be put under `parentId`, or null when it can. `spheres` is the account's live
 * list; `id` need not be in it yet.
 */
export function nestingRefusal(
  id: string,
  parentId: string,
  spheres: readonly (SphereNode & { readonly isBuffer: boolean })[],
): NestingRefusal | null {
  if (id === parentId) return "self";
  const parent = spheres.find((sphere) => sphere.id === parentId);
  if (!parent) return "missing";
  if (parent.isBuffer) return "buffer";
  if (parent.parentId !== null) return "nested";
  if (spheres.some((sphere) => sphere.parentId === id)) return "has-parts";
  return null;
}

/** Hours the parts ask for beyond what their sphere has; 0 when they fit. */
export function overBudgetHours(parent: SphereBudget, spheres: readonly SphereBudget[]): number {
  const asked = spheres
    .filter((sphere) => sphere.parentId === parent.id)
    .reduce((sum, sphere) => sum + sphere.targetHoursPerWeek, 0);
  return Math.max(0, round(asked - parent.targetHoursPerWeek));
}

/** The sentence said when the parts don't fit. A warning: nothing is refused for it. */
export function overBudgetWarning(parent: SphereBudget, spheres: readonly SphereBudget[]): string | null {
  const over = overBudgetHours(parent, spheres);
  if (over === 0) return null;
  const asked = round(parent.targetHoursPerWeek + over);
  return `The parts of ${parent.name} ask for ${asked}h a week, ${over}h more than its ${parent.targetHoursPerWeek}h.`;
}

export interface CountedBlock extends Span {
  readonly weights: readonly Weight[];
}

export interface HoursSoFar {
  /** Hours of blocks that have already happened. */
  readonly tracked: number;
  /** Hours of blocks still ahead in the window. */
  readonly scheduled: number;
}

/**
 * A window's hours per sphere, split at `now`. Blocks that overlap share the time, as everywhere
 * else, and a part's hours are its own and its parent's too.
 */
export function hoursBySphere(
  blocks: readonly CountedBlock[],
  window: Span,
  now: number,
  parents: ReadonlyMap<string, string>,
): Map<string, HoursSoFar> {
  const split = Math.min(Math.max(now, window.start), window.end);
  const before = sharedDurations(blocks, { start: window.start, end: split });
  const after = sharedDurations(blocks, { start: split, end: window.end });
  const totals = new Map<string, { tracked: number; scheduled: number }>();

  const credit = (id: string, tracked: number, scheduled: number) => {
    const total = totals.get(id) ?? { tracked: 0, scheduled: 0 };
    total.tracked += tracked;
    total.scheduled += scheduled;
    totals.set(id, total);
  };

  blocks.forEach((block, index) => {
    for (const weight of block.weights) {
      const share = weight.weightPercent / 100 / HOUR_MS;
      const tracked = before[index] * share;
      const scheduled = after[index] * share;
      credit(weight.categoryId, tracked, scheduled);
      const parent = parents.get(weight.categoryId);
      if (parent) credit(parent, tracked, scheduled);
    }
  });

  return new Map([...totals].map(([id, t]) => [id, { tracked: round(t.tracked), scheduled: round(t.scheduled) }]));
}

export interface SphereProgress {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly urn: string | null;
  readonly targetHours: number;
  /** Hours already spent this week; a sphere's include its parts'. */
  readonly trackedHours: number;
  /** Hours still on the calendar this week. */
  readonly scheduledHours: number;
  /** Target left once both are counted; 0 when the week already holds enough. */
  readonly remainingHours: number;
  /** The sentence said when a sphere's parts ask for more than it has. */
  readonly warning: string | null;
}

/**
 * Every live sphere against its week, parents before their parts, in the order given. The Buffer
 * has no target of its own to be measured against and is left out.
 */
export function progressOf(
  spheres: readonly (SphereBudget & { readonly urn: string | null; readonly isBuffer: boolean })[],
  hours: ReadonlyMap<string, HoursSoFar>,
): SphereProgress[] {
  const measured = spheres.filter((sphere) => !sphere.isBuffer);
  const row = (sphere: (typeof measured)[number]): SphereProgress => {
    const { tracked, scheduled } = hours.get(sphere.id) ?? { tracked: 0, scheduled: 0 };
    return {
      id: sphere.id,
      name: sphere.name,
      parentId: sphere.parentId,
      urn: sphere.urn,
      targetHours: sphere.targetHoursPerWeek,
      trackedHours: tracked,
      scheduledHours: scheduled,
      remainingHours: Math.max(0, round(sphere.targetHoursPerWeek - tracked - scheduled)),
      warning: sphere.parentId ? null : overBudgetWarning(sphere, measured),
    };
  };
  const ids = new Set(measured.map((sphere) => sphere.id));
  // A part whose parent is gone has nowhere to be drawn under, so it stands on its own.
  const roots = measured.filter((sphere) => !sphere.parentId || !ids.has(sphere.parentId));
  return roots.flatMap((root) => [
    row(root),
    ...measured.filter((sphere) => sphere.parentId === root.id && sphere !== root).map(row),
  ]);
}

function round(hours: number): number {
  return Math.round(hours * 100) / 100;
}
