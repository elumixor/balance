import { and, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { categories } from "../db/schema";

type Category = typeof categories.$inferSelect;

/**
 * Manages each user's system-managed "Buffer" category, which always absorbs
 * whatever a 168-hour week hasn't been explicitly allocated to other categories.
 */
export class BufferCategoryService {
  static readonly WEEK_HOURS = 168;
  static readonly NAME = "Buffer";

  /** Makes sure the user's buffer category exists. Safe to call repeatedly. */
  async ensure(userId: string): Promise<Category> {
    const existing = await db.query.categories.findFirst({
      where: and(eq(categories.userId, userId), eq(categories.isBuffer, true)),
    });
    if (existing) return existing;

    const [created] = await db
      .insert(categories)
      .values({
        userId,
        name: BufferCategoryService.NAME,
        color: "#71717a",
        icon: "circle-dashed",
        targetHoursPerWeek: BufferCategoryService.WEEK_HOURS.toString(),
        isBuffer: true,
      })
      .returning();
    return created;
  }

  /**
   * Recomputes the buffer category's target so it always absorbs whatever the user's
   * other (non-archived) categories haven't claimed out of a 168-hour week. Clamped to
   * 0 if the user has over-allocated.
   */
  async sync(userId: string): Promise<void> {
    const buffer = await this.ensure(userId);

    const others = await db.query.categories.findMany({
      where: and(eq(categories.userId, userId), eq(categories.archived, false), ne(categories.id, buffer.id)),
      columns: { targetHoursPerWeek: true },
    });

    const allocated = others.reduce((sum, c) => sum + Number(c.targetHoursPerWeek), 0);
    const remaining = Math.max(0, BufferCategoryService.WEEK_HOURS - allocated);
    // A write here bumps `updatedAt`, which is what every synced client watches. Recomputing the
    // same number it already holds is not a change, and must not look like one.
    if (Number(buffer.targetHoursPerWeek) === remaining) return;

    await db.update(categories).set({ targetHoursPerWeek: remaining.toString() }).where(eq(categories.id, buffer.id));
  }
}

export const bufferCategoryService = new BufferCategoryService();
