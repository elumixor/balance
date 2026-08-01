import { and, eq, gte, isNull, lt, or } from "drizzle-orm";
import { db } from "../../db";
import { activities, categories, entries } from "../../db/schema";
import { syncBufferCategory } from "../buffer-category";
import type { ActivityInput, CategoryInput, EntryInput, WeightInput } from "./calculations";

export interface StatsData {
  categories: CategoryInput[];
  activities: ActivityInput[];
  entries: EntryInput[];
  weights: WeightInput[];
}

/**
 * Fetch everything needed to compute stats for a user across a date range.
 * `rangeStart`/`rangeEnd` should cover the widest window the caller needs
 * (i.e. including the lookback required for rolling trends).
 */
export async function getStatsData(userId: string, rangeStart: Date, rangeEnd: Date): Promise<StatsData> {
  await syncBufferCategory(userId);

  const [categoryRows, activityRows, weightRows, entryRows] = await Promise.all([
    db.query.categories.findMany({
      where: and(eq(categories.userId, userId), eq(categories.archived, false)),
    }),
    db.query.activities.findMany({
      where: eq(activities.userId, userId),
    }),
    db.query.activityCategoryWeights.findMany(),
    db.query.entries.findMany({
      where: and(
        eq(entries.userId, userId),
        lt(entries.startedAt, rangeEnd),
        or(isNull(entries.endedAt), gte(entries.endedAt, rangeStart)),
      ),
    }),
  ]);

  const activityIds = new Set(activityRows.map((a) => a.id));

  return {
    categories: categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      targetHoursPerWeek: Number(c.targetHoursPerWeek),
    })),
    activities: activityRows.map((a) => ({ id: a.id, name: a.name })),
    weights: weightRows.filter((w) => activityIds.has(w.activityId)),
    entries: entryRows.map((e) => ({
      id: e.id,
      activityId: e.activityId,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
    })),
  };
}
