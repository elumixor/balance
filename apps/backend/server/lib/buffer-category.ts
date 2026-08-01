import { and, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { categories } from "../db/schema";

export const WEEK_HOURS = 168;
export const BUFFER_CATEGORY_NAME = "Rest + Buffer";

/** Make sure the user's system-managed buffer category exists. Safe to call repeatedly. */
export async function ensureBufferCategory(userId: string) {
  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.userId, userId), eq(categories.isBuffer, true)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(categories)
    .values({
      userId,
      name: BUFFER_CATEGORY_NAME,
      color: "#71717a",
      targetHoursPerWeek: WEEK_HOURS.toString(),
      isBuffer: true,
    })
    .returning();
  return created;
}

/**
 * Recompute the buffer category's target so it always absorbs whatever the user's
 * other (non-archived) categories haven't claimed out of a 168-hour week. Clamped to
 * 0 if the user has over-allocated.
 */
export async function syncBufferCategory(userId: string) {
  const buffer = await ensureBufferCategory(userId);

  const others = await db.query.categories.findMany({
    where: and(eq(categories.userId, userId), eq(categories.archived, false), ne(categories.id, buffer.id)),
    columns: { targetHoursPerWeek: true },
  });

  const allocated = others.reduce((sum, c) => sum + Number(c.targetHoursPerWeek), 0);
  const remaining = Math.max(0, WEEK_HOURS - allocated);

  await db.update(categories).set({ targetHoursPerWeek: remaining.toString() }).where(eq(categories.id, buffer.id));
}
