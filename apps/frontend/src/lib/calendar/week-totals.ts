import { restColor } from "$lib/colors";
import { DEFAULT_ICON } from "$lib/icons";
import type { CalendarEvent, Category } from "$lib/types";

const MS_PER_HOUR = 3_600_000;
const HOURS_PER_WEEK = 168;

export interface CategoryTotal {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly plannedHours: number;
  readonly actualHours: number;
}

/**
 * The same arithmetic the backend does for `/stats?period=week`, run here so the meters move the
 * moment a block is dropped or remapped, instead of a refetch later.
 *
 * Only categorised time is counted. Everything else — empty hours, and events that don't count as
 * anything yet — is rest, so the week always adds up to a week and nothing is left dangling.
 */
export function weekTotals(
  events: readonly CalendarEvent[],
  categories: readonly Category[],
  weekStart: Date,
): CategoryTotal[] {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * MS_PER_HOUR);
  const actual = new Map<string, number>();
  const buffers = new Set(categories.filter((c) => c.isBuffer).map((c) => c.id));
  let claimed = 0;

  for (const event of events) {
    if (!event.countsTowardHours) continue;
    const hours = overlapHours(event, weekStart, weekEnd);
    if (hours <= 0) continue;

    for (const weight of event.weights) {
      if (buffers.has(weight.categoryId)) continue;
      const share = hours * (weight.weightPercent / 100);
      actual.set(weight.categoryId, (actual.get(weight.categoryId) ?? 0) + share);
      claimed += share;
    }
  }

  const rest = Math.max(0, HOURS_PER_WEEK - claimed);

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    color: category.isBuffer ? restColor : category.color,
    icon: category.isBuffer ? DEFAULT_ICON : category.icon,
    plannedHours: category.targetHoursPerWeek,
    actualHours: category.isBuffer ? rest : (actual.get(category.id) ?? 0),
  }));
}

/** Clipping to the week is what makes an event that straddles Sunday night count on both sides. */
function overlapHours(event: CalendarEvent, weekStart: Date, weekEnd: Date): number {
  const start = Math.max(new Date(event.start).getTime(), weekStart.getTime());
  const end = Math.min(new Date(event.end).getTime(), weekEnd.getTime());
  return end > start ? (end - start) / MS_PER_HOUR : 0;
}
