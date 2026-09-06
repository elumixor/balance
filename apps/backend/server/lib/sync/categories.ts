import { type Envelope, RejectedError, type SyncedStore, syncedModel } from "@elumixor/synced/server";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { categories } from "~/db/schema";
import { bufferCategoryService } from "~/lib/categories/buffer";

/**
 * A category as both halves of the app agree it looks.
 *
 * `archived` isn't here: archiving *is* deleting, as far as anything reading this model goes, and
 * a deleted record travels as a tombstone. One fact, one place.
 */
export const categorySchema = z.object({
  id: z.uuid(),
  /** Blank while it's being typed: a slice is cut on the ring before it's named. */
  name: z.string().trim(),
  color: z.string().trim().min(1),
  icon: z.string().trim().min(1),
  targetHoursPerWeek: z.number().min(0).max(168),
  /** Server-owned: the buffer is made and maintained here, never by a client. */
  isBuffer: z.boolean().default(false),
});

export type SyncedCategory = z.infer<typeof categorySchema>;

type Row = typeof categories.$inferSelect;

function envelopeOf(row: Row): Envelope<SyncedCategory> {
  return {
    id: row.id,
    updatedAt: row.updatedAt.getTime(),
    deleted: row.archived,
    data: {
      id: row.id,
      name: row.name,
      color: row.color,
      icon: row.icon,
      targetHoursPerWeek: Number(row.targetHoursPerWeek),
      isBuffer: row.isBuffer,
    },
  };
}

/** The columns a write may touch, in the shape the table wants them. */
function columnsOf(patch: Partial<SyncedCategory>) {
  return {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.color === undefined ? {} : { color: patch.color }),
    ...(patch.icon === undefined ? {} : { icon: patch.icon }),
    ...(patch.targetHoursPerWeek === undefined ? {} : { targetHoursPerWeek: patch.targetHoursPerWeek.toString() }),
  };
}

class CategoryStore implements SyncedStore<SyncedCategory> {
  async pull(userId: string, since: number) {
    // The buffer's target is derived from every other category's, so it has to be right before
    // anyone reads it — and a client's first pull is the only chance to make one for a new user.
    await bufferCategoryService.sync(userId);
    const rows = await db.query.categories.findMany({
      where: and(eq(categories.userId, userId), gte(categories.updatedAt, new Date(since))),
      orderBy: categories.updatedAt,
    });
    return rows.map(envelopeOf);
  }

  async read(userId: string, id: string) {
    const row = await this.#row(userId, id);
    return row ? envelopeOf(row).data : null;
  }

  /** Also how a deleted category comes back: the same id, written again by a redone step. */
  async create(userId: string, record: SyncedCategory) {
    await db
      .insert(categories)
      .values({
        id: record.id,
        userId,
        name: record.name,
        color: record.color,
        icon: record.icon,
        targetHoursPerWeek: record.targetHoursPerWeek.toString(),
      })
      .onConflictDoUpdate({
        target: categories.id,
        set: { ...columnsOf(record), archived: false, updatedAt: new Date() },
        setWhere: eq(categories.userId, userId),
      });
    return this.#confirm(userId, record.id);
  }

  async update(userId: string, id: string, patch: Partial<SyncedCategory>) {
    await db
      .update(categories)
      .set(columnsOf(patch))
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
    return this.#confirm(userId, id);
  }

  /** Archiving, not deleting: the hours already counted against it stay counted. */
  async remove(userId: string, id: string) {
    await db
      .update(categories)
      .set({ archived: true })
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
    return this.#confirm(userId, id);
  }

  async #confirm(userId: string, id: string) {
    await bufferCategoryService.sync(userId);
    const row = await this.#row(userId, id);
    if (!row) throw new RejectedError("That category no longer exists.");
    return envelopeOf(row);
  }

  #row(userId: string, id: string) {
    return db.query.categories.findFirst({ where: and(eq(categories.id, id), eq(categories.userId, userId)) });
  }
}

export const categoriesModel = syncedModel({
  name: "categories",
  schema: categorySchema,
  store: new CategoryStore(),
  writable: (category) => !category.isBuffer,
});
