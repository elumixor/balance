import type { PlannedBlock } from "~/db/schema";
import type { ResolvedEvent } from "~/lib/calendar/events-service";
import type { Block } from "./coverage";
import type { CategoryHours, PlanCategory, SessionBlock } from "./types";

/** The pure arithmetic under every planning view: events and a ring in, hours and blocks out. */

const MS_PER_HOUR = 3_600_000;

/** What the ring claims in a week, buffer excluded — the hours the user means to direct. */
export function claimedHours(plan: readonly PlanCategory[]): number {
  return plan.reduce((sum, category) => (category.isBuffer ? sum : sum + category.targetHoursPerWeek), 0);
}

/** Hours per category over a range, split the way each event is mapped, biggest first. */
export function categoryHours(
  events: readonly ResolvedEvent[],
  plan: readonly PlanCategory[],
  range: { start: Date; end: Date },
): CategoryHours[] {
  const hours = new Map<string, number>();

  for (const event of events) {
    if (!event.countsTowardHours) continue;
    const from = Math.max(event.start.getTime(), range.start.getTime());
    const to = Math.min(event.end.getTime(), range.end.getTime());
    if (to <= from) continue;
    const span = (to - from) / MS_PER_HOUR;
    for (const weight of event.weights) {
      hours.set(weight.categoryId, (hours.get(weight.categoryId) ?? 0) + span * (weight.weightPercent / 100));
    }
  }

  return plan
    .filter((category) => !category.isBuffer)
    .map((category) => ({
      categoryId: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      hours: hours.get(category.id) ?? 0,
      targetHours: category.targetHoursPerWeek,
    }))
    .sort((a, b) => b.hours - a.hours);
}

/** The events inside a range, clipped to it, each carrying the category it mostly counts as. */
export function blocksOf(
  events: readonly ResolvedEvent[],
  range: { start: Date; end: Date },
  plan: readonly PlanCategory[] = [],
): SessionBlock[] {
  const byId = new Map(plan.map((category) => [category.id, category]));

  return events
    .filter((event) => event.countsTowardHours && event.end > range.start && event.start < range.end)
    .map((event) => {
      const from = Math.max(event.start.getTime(), range.start.getTime());
      const to = Math.min(event.end.getTime(), range.end.getTime());
      // The category an event mostly is. A split block still belongs somewhere on a day view,
      // and "mostly" is the only honest single answer.
      const main = [...event.weights].sort((a, b) => b.weightPercent - a.weightPercent)[0];
      const category = main ? byId.get(main.categoryId) : undefined;
      return {
        id: event.id,
        title: event.title,
        start: new Date(from).toISOString(),
        end: new Date(to).toISOString(),
        categoryId: main?.categoryId ?? null,
        categoryName: category?.name ?? null,
        color: category?.color ?? null,
        icon: category?.icon ?? null,
        hours: (to - from) / MS_PER_HOUR,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function toBlock(block: SessionBlock): Block {
  return { start: Date.parse(block.start), end: Date.parse(block.end), categoryId: block.categoryId };
}

export function toPlannedBlock(block: SessionBlock): PlannedBlock {
  return { id: block.id, start: Date.parse(block.start), end: Date.parse(block.end), categoryId: block.categoryId };
}
