import type { CalendarEvent, Category } from "$lib/types";

/**
 * The category an event reads as: the heaviest slice of its activity's mix.
 *
 * Buffer categories are skipped — they're the app's name for unallocated time, so an hour that
 * mostly buffers still shows the real thing it partly was. Null when nothing is mapped, which is
 * what the neutral colour is for.
 */
export function eventCategory(event: CalendarEvent, categories: Map<string, Category>): Category | null {
  const ranked = event.weights
    .map((weight) => ({ weight: weight.weightPercent, category: categories.get(weight.categoryId) }))
    .filter((entry) => entry.category && !entry.category.isBuffer)
    .sort((a, b) => b.weight - a.weight);
  return ranked[0]?.category ?? null;
}
