import { and, eq, gte } from "drizzle-orm";
import { db } from "~/db";
import { categories, plannedDays, plannedWeeks } from "~/db/schema";
import { CalendarEventsService, type ResolvedEvent } from "~/lib/calendar/events-service";
import { bufferCategoryService } from "~/lib/categories/buffer";
import { blocksOf, categoryHours } from "./blocks";
import { balanceMatch, coverage } from "./coverage";
import { addDays, type Day, rangeOf, weekStartOf } from "./days";
import type { DayView, PlanCategory } from "./types";

/** The days that were sat down and planned, and the views the ritual draws of any day. */
export class PlannedDays {
  constructor(private readonly userId: string) {}

  day(day: Day) {
    return db.query.plannedDays.findFirst({
      where: and(eq(plannedDays.userId, this.userId), eq(plannedDays.day, day)),
    });
  }

  week(weekStart: Day) {
    return db.query.plannedWeeks.findFirst({
      where: and(eq(plannedWeeks.userId, this.userId), eq(plannedWeeks.weekStart, weekStart)),
    });
  }

  /** The earliest day ever planned — nothing to be behind on until the ritual has been started once. */
  first() {
    return db.query.plannedDays.findFirst({
      where: eq(plannedDays.userId, this.userId),
      orderBy: (row, { asc }) => [asc(row.day)],
    });
  }

  since(from: Day) {
    return db.query.plannedDays.findMany({
      where: and(eq(plannedDays.userId, this.userId), gte(plannedDays.day, from)),
    });
  }

  all() {
    return db.query.plannedDays.findMany({
      where: eq(plannedDays.userId, this.userId),
      columns: { day: true, ahead: true, rest: true, coveragePercent: true },
    });
  }

  /** The calendar and the ring over a span of days, which is all any of the views are made of. */
  async load(from: Day, to: Day, timeZone: string) {
    await bufferCategoryService.sync(this.userId);
    const start = rangeOf(from, timeZone).start;
    const end = rangeOf(to, timeZone).end;

    const [rows, range] = await Promise.all([
      db.query.categories.findMany({
        where: and(eq(categories.userId, this.userId), eq(categories.archived, false)),
      }),
      new CalendarEventsService(this.userId).resolve(start, end),
    ]);

    return {
      connected: range.connected,
      needsReconnect: range.needsReconnect,
      events: range.events,
      categories: rows.map(
        (row): PlanCategory => ({
          id: row.id,
          name: row.name,
          color: row.color,
          icon: row.icon,
          targetHoursPerWeek: Number(row.targetHoursPerWeek),
          isBuffer: row.isBuffer,
        }),
      ),
    };
  }

  viewOf(
    day: Day,
    timeZone: string,
    events: readonly ResolvedEvent[],
    plan: readonly PlanCategory[],
    budgetHours: number,
    planned: { rest: boolean } | null | undefined,
  ): DayView {
    const blocks = blocksOf(events, rangeOf(day, timeZone), plan);
    const mappedHours = blocks.reduce((sum, block) => (block.categoryId ? sum + block.hours : sum), 0);
    return {
      day,
      planned: !!planned,
      rest: planned?.rest ?? false,
      coverage: coverage({ mappedHours, budgetHours }),
      mappedHours,
      budgetHours,
      blocks,
    };
  }

  /** The week a review is about: where its hours went, and how closely it followed the ring. */
  weekView(day: Day, timeZone: string, events: readonly ResolvedEvent[], plan: readonly PlanCategory[]) {
    const weekStart = weekStartOf(day);
    const range = { start: rangeOf(weekStart, timeZone).start, end: rangeOf(addDays(weekStart, 6), timeZone).end };
    const hours = categoryHours(events, plan, range);
    return {
      weekStart,
      categories: hours,
      match: balanceMatch(hours.map((c) => ({ ...c, actualHours: c.hours, isBuffer: false }))),
      hours: hours.reduce((sum, category) => sum + category.hours, 0),
    };
  }
}
