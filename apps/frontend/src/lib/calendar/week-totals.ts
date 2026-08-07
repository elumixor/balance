import { restColor } from "$lib/colors";
import type { CalendarEvent, Category } from "$lib/types";

const MS_PER_HOUR = 3_600_000;

export interface CategoryTotal {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly plannedHours: number;
  readonly actualHours: number;
}

export interface WeekTotals {
  readonly categories: CategoryTotal[];
  readonly uncategorisedHours: number;
}

/**
 * The same arithmetic the backend does for `/stats?period=week`, run here so the header moves the
 * moment a block is dropped or remapped, instead of a refetch later.
 */
export function weekTotals(
  events: readonly CalendarEvent[],
  categories: readonly Category[],
  weekStart: Date,
): WeekTotals {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * MS_PER_HOUR);
  const actual = new Map<string, number>();
  let uncategorisedHours = 0;

  for (const event of events) {
    if (!event.countsTowardHours) continue;
    const hours = overlapHours(event, weekStart, weekEnd);
    if (hours <= 0) continue;

    if (event.weights.length === 0) {
      uncategorisedHours += hours;
      continue;
    }
    for (const weight of event.weights) {
      actual.set(weight.categoryId, (actual.get(weight.categoryId) ?? 0) + hours * (weight.weightPercent / 100));
    }
  }

  return {
    uncategorisedHours,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.isBuffer ? restColor : category.color,
      plannedHours: category.targetHoursPerWeek,
      actualHours: actual.get(category.id) ?? 0,
    })),
  };
}

/** Clipping to the week is what makes an event that straddles Sunday night count on both sides. */
function overlapHours(event: CalendarEvent, weekStart: Date, weekEnd: Date): number {
  const start = Math.max(new Date(event.start).getTime(), weekStart.getTime());
  const end = Math.min(new Date(event.end).getTime(), weekEnd.getTime());
  return end > start ? (end - start) / MS_PER_HOUR : 0;
}
