import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { categories } from "../../db/schema";
import { bufferCategoryService } from "../buffer-category";
import { CalendarEventsService } from "../calendar/events-service";
import type { CategoryInput, EventInput } from "./types";

export interface StatsData {
  categories: CategoryInput[];
  events: EventInput[];
  connected: boolean;
  needsReconnect: boolean;
}

/** Fetches everything needed to compute stats for a user across a date range. */
export class StatsRepository {
  constructor(private readonly userId: string) {}

  /**
   * `rangeStart`/`rangeEnd` should cover the widest window the caller needs
   * (i.e. including the lookback required for rolling trends).
   */
  async get(rangeStart: Date, rangeEnd: Date): Promise<StatsData> {
    await bufferCategoryService.sync(this.userId);

    const [categoryRows, range] = await Promise.all([
      db.query.categories.findMany({
        where: and(eq(categories.userId, this.userId), eq(categories.archived, false)),
      }),
      new CalendarEventsService(this.userId).resolve(rangeStart, rangeEnd),
    ]);

    return {
      connected: range.connected,
      needsReconnect: range.needsReconnect,
      categories: categoryRows.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        targetHoursPerWeek: Number(c.targetHoursPerWeek),
      })),
      // An event mapped straight to categories has no activity to name it, so it stands for
      // itself in the breakdown — which reads better than "Other" anyway.
      events: range.events
        .filter((e) => e.countsTowardHours && e.weights.length > 0)
        .map((e) => ({
          id: e.id,
          startedAt: e.start,
          endedAt: e.end,
          weights: e.weights,
          source: { id: e.mapping?.activityId ?? `event:${e.id}`, name: e.mapping?.activityName ?? e.title },
        })),
    };
  }
}
