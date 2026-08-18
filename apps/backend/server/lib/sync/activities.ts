import { type Envelope, RejectedError, type SyncedStore, syncedModel } from "@elumixor/synced/server";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { activities, activityCategoryWeights } from "../../db/schema";
import { ActivityService } from "../categories-service";

export const activitySchema = z.object({
  id: z.uuid(),
  /** Blank while it's being typed: the row is on screen before it's named. */
  name: z.string().trim(),
  /** What an hour of this counts toward. Anything left unassigned belongs to the buffer. */
  weights: z.array(z.object({ categoryId: z.uuid(), weightPercent: z.number().min(0).max(100) })),
});

export type SyncedActivity = z.infer<typeof activitySchema>;

type Row = typeof activities.$inferSelect & { weights: (typeof activityCategoryWeights.$inferSelect)[] };

function envelopeOf(row: Row): Envelope<SyncedActivity> {
  return {
    id: row.id,
    updatedAt: row.updatedAt.getTime(),
    deleted: row.archived,
    data: {
      id: row.id,
      name: row.name,
      weights: row.weights.map((weight) => ({
        categoryId: weight.categoryId,
        weightPercent: weight.weightPercent,
      })),
    },
  };
}

/**
 * An activity is its name and its split, and a client that only ever sees the two together has
 * to be told when either moves — so a weight changing bumps the activity's own `updatedAt`.
 */
class ActivityStore implements SyncedStore<SyncedActivity> {
  async pull(userId: string, since: number) {
    const rows = await db.query.activities.findMany({
      where: and(eq(activities.userId, userId), gte(activities.updatedAt, new Date(since))),
      orderBy: activities.updatedAt,
      with: { weights: true },
    });
    return rows.map(envelopeOf);
  }

  async read(userId: string, id: string) {
    const row = await this.#row(userId, id);
    return row ? envelopeOf(row).data : null;
  }

  async create(userId: string, record: SyncedActivity) {
    await db
      .insert(activities)
      .values({ id: record.id, userId, name: record.name })
      .onConflictDoUpdate({
        target: activities.id,
        set: { name: record.name, archived: false, updatedAt: new Date() },
        setWhere: eq(activities.userId, userId),
      });
    await this.#writeWeights(userId, record.id, record.weights);
    return this.#confirm(userId, record.id);
  }

  async update(userId: string, id: string, patch: Partial<SyncedActivity>) {
    await db
      .update(activities)
      .set({ ...(patch.name === undefined ? {} : { name: patch.name }), updatedAt: new Date() })
      .where(and(eq(activities.id, id), eq(activities.userId, userId)));
    if (patch.weights) await this.#writeWeights(userId, id, patch.weights);
    return this.#confirm(userId, id);
  }

  /** Archiving, not deleting: events already mapped to it keep counting where they counted. */
  async remove(userId: string, id: string) {
    await db
      .update(activities)
      .set({ archived: true })
      .where(and(eq(activities.id, id), eq(activities.userId, userId)));
    return this.#confirm(userId, id);
  }

  async #writeWeights(userId: string, id: string, weights: SyncedActivity["weights"]) {
    const resolved = await new ActivityService(userId).resolveWeightsWithBufferRemainder(weights);
    await db.delete(activityCategoryWeights).where(eq(activityCategoryWeights.activityId, id));
    if (resolved.length === 0) return;
    await db.insert(activityCategoryWeights).values(
      resolved.map((weight) => ({
        activityId: id,
        categoryId: weight.categoryId,
        weightPercent: weight.weightPercent,
      })),
    );
  }

  async #confirm(userId: string, id: string) {
    const row = await this.#row(userId, id);
    if (!row) throw new RejectedError("That activity no longer exists.");
    return envelopeOf(row);
  }

  #row(userId: string, id: string) {
    return db.query.activities.findFirst({
      where: and(eq(activities.id, id), eq(activities.userId, userId)),
      with: { weights: true },
    });
  }
}

export const activitiesModel = syncedModel({
  name: "activities",
  schema: activitySchema,
  store: new ActivityStore(),
});
