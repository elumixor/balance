"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, activityCategoryWeights, categories } from "@/db/schema";
import { ensureBufferCategory, syncBufferCategory } from "@/lib/buffer-category";
import { getOrCreateDbUser } from "@/lib/current-user";
import type { ActivityInput, CategoryInput } from "./types";

async function assertNotBuffer(id: string, userId: string) {
  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, userId)),
  });
  if (!existing) throw new Error("Category not found");
  if (existing.isBuffer) throw new Error("The Rest + Buffer category is system-managed and can't be edited directly");
}

export async function createCategory(input: CategoryInput) {
  const user = await getOrCreateDbUser();
  await db.insert(categories).values({
    userId: user.id,
    name: input.name,
    color: input.color,
    targetHoursPerWeek: input.targetHoursPerWeek.toString(),
    trackingMode: input.trackingMode,
    isProductiveLoad: input.isProductiveLoad,
  });
  await syncBufferCategory(user.id);
  revalidatePath("/config");
}

export async function updateCategory(id: string, input: CategoryInput) {
  const user = await getOrCreateDbUser();
  await assertNotBuffer(id, user.id);
  await db
    .update(categories)
    .set({
      name: input.name,
      color: input.color,
      targetHoursPerWeek: input.targetHoursPerWeek.toString(),
      trackingMode: input.trackingMode,
      isProductiveLoad: input.isProductiveLoad,
    })
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));
  await syncBufferCategory(user.id);
  revalidatePath("/config");
}

export async function archiveCategory(id: string) {
  const user = await getOrCreateDbUser();
  await assertNotBuffer(id, user.id);
  await db
    .update(categories)
    .set({ archived: true })
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));
  await syncBufferCategory(user.id);
  revalidatePath("/config");
}

/**
 * Explicit weights may leave time unassigned — that remainder implicitly belongs to the
 * user's Rest + Buffer category, so an activity with no weights at all is 100% free time.
 * Returns the full weight list (explicit + implicit buffer remainder, if any) to persist.
 */
async function resolveWeightsWithBufferRemainder(userId: string, weights: ActivityInput["weights"]) {
  const explicitTotal = weights.reduce((sum, w) => sum + w.weightPercent, 0);
  if (explicitTotal > 100) {
    throw new Error("Category weights can't add up to more than 100%");
  }

  const remainder = 100 - explicitTotal;
  if (remainder <= 0) return weights;

  const buffer = await ensureBufferCategory(userId);
  return [...weights, { categoryId: buffer.id, weightPercent: remainder }];
}

export async function createActivity(input: ActivityInput) {
  const user = await getOrCreateDbUser();
  const weights = await resolveWeightsWithBufferRemainder(user.id, input.weights);

  const [activity] = await db
    .insert(activities)
    .values({ userId: user.id, name: input.name })
    .returning();

  await db.insert(activityCategoryWeights).values(
    weights.map((w) => ({
      activityId: activity.id,
      categoryId: w.categoryId,
      weightPercent: w.weightPercent,
    })),
  );

  revalidatePath("/config");
}

export async function updateActivity(id: string, input: ActivityInput) {
  const user = await getOrCreateDbUser();
  const weights = await resolveWeightsWithBufferRemainder(user.id, input.weights);

  const existing = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.userId, user.id)),
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

  revalidatePath("/config");
}

export async function archiveActivity(id: string) {
  const user = await getOrCreateDbUser();
  await db
    .update(activities)
    .set({ archived: true })
    .where(and(eq(activities.id, id), eq(activities.userId, user.id)));
  revalidatePath("/config");
}
