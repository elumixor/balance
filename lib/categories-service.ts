import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, activityCategoryWeights, categories } from "@/db/schema";
import { ensureBufferCategory, syncBufferCategory } from "@/lib/buffer-category";

export type CategoryInput = {
  name: string;
  color: string;
  targetHoursPerWeek: number;
  trackingMode: "consistency" | "average";
  isProductiveLoad: boolean;
};

export type ActivityWeightInput = {
  categoryId: string;
  weightPercent: number;
};

export type ActivityInput = {
  name: string;
  weights: ActivityWeightInput[];
};

async function assertNotBuffer(id: string, userId: string) {
  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, userId)),
  });
  if (!existing) throw new Error("Category not found");
  if (existing.isBuffer) throw new Error("The Rest + Buffer category is system-managed and can't be edited directly");
}

export async function createCategoryForUser(userId: string, input: CategoryInput) {
  await db.insert(categories).values({
    userId,
    name: input.name,
    color: input.color,
    targetHoursPerWeek: input.targetHoursPerWeek.toString(),
    trackingMode: input.trackingMode,
    isProductiveLoad: input.isProductiveLoad,
  });
  await syncBufferCategory(userId);
}

export async function updateCategoryForUser(userId: string, id: string, input: CategoryInput) {
  await assertNotBuffer(id, userId);
  await db
    .update(categories)
    .set({
      name: input.name,
      color: input.color,
      targetHoursPerWeek: input.targetHoursPerWeek.toString(),
      trackingMode: input.trackingMode,
      isProductiveLoad: input.isProductiveLoad,
    })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  await syncBufferCategory(userId);
}

export async function archiveCategoryForUser(userId: string, id: string) {
  await assertNotBuffer(id, userId);
  await db
    .update(categories)
    .set({ archived: true })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  await syncBufferCategory(userId);
}

/**
 * Explicit weights may leave time unassigned — that remainder implicitly belongs to the
 * user's Rest + Buffer category, so an activity with no weights at all is 100% free time.
 * Returns the full weight list (explicit + implicit buffer remainder, if any) to persist.
 */
export async function resolveWeightsWithBufferRemainder(userId: string, weights: ActivityWeightInput[]) {
  const explicitTotal = weights.reduce((sum, w) => sum + w.weightPercent, 0);
  if (explicitTotal > 100) {
    throw new Error("Category weights can't add up to more than 100%");
  }

  const remainder = 100 - explicitTotal;
  if (remainder <= 0) return weights;

  const buffer = await ensureBufferCategory(userId);
  return [...weights, { categoryId: buffer.id, weightPercent: remainder }];
}

export async function createActivityForUser(userId: string, input: ActivityInput) {
  const weights = await resolveWeightsWithBufferRemainder(userId, input.weights);

  const [activity] = await db.insert(activities).values({ userId, name: input.name }).returning();

  await db.insert(activityCategoryWeights).values(
    weights.map((w) => ({
      activityId: activity.id,
      categoryId: w.categoryId,
      weightPercent: w.weightPercent,
    })),
  );

  return activity;
}

export async function updateActivityForUser(userId: string, id: string, input: ActivityInput) {
  const weights = await resolveWeightsWithBufferRemainder(userId, input.weights);

  const existing = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.userId, userId)),
  });
  if (!existing) throw new Error("Activity not found");

  await db.update(activities).set({ name: input.name }).where(eq(activities.id, id));
  await db.delete(activityCategoryWeights).where(eq(activityCategoryWeights.activityId, id));
  await db.insert(activityCategoryWeights).values(
    weights.map((w) => ({
      activityId: id,
      categoryId: w.categoryId,
      weightPercent: w.weightPercent,
    })),
  );
}

export async function archiveActivityForUser(userId: string, id: string) {
  await db
    .update(activities)
    .set({ archived: true })
    .where(and(eq(activities.id, id), eq(activities.userId, userId)));
}

export async function getCategoriesForUser(userId: string) {
  await syncBufferCategory(userId);
  return db.query.categories.findMany({
    where: and(eq(categories.userId, userId), eq(categories.archived, false)),
    orderBy: (c, { asc }) => [asc(c.createdAt)],
  });
}

export async function getActivitiesForUser(userId: string) {
  return db.query.activities.findMany({
    where: and(eq(activities.userId, userId), eq(activities.archived, false)),
    orderBy: (a, { asc }) => [asc(a.createdAt)],
    with: { weights: true },
  });
}
