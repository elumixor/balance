"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, activityCategoryWeights, categories } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/current-user";
import type { ActivityInput, CategoryInput } from "./types";

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
  revalidatePath("/config");
}

export async function updateCategory(id: string, input: CategoryInput) {
  const user = await getOrCreateDbUser();
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
  revalidatePath("/config");
}

export async function archiveCategory(id: string) {
  const user = await getOrCreateDbUser();
  await db
    .update(categories)
    .set({ archived: true })
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));
  revalidatePath("/config");
}

function assertWeightsSumTo100(weights: ActivityInput["weights"]) {
  const total = weights.reduce((sum, w) => sum + w.weightPercent, 0);
  if (weights.length === 0 || total !== 100) {
    throw new Error("Category weights must sum to exactly 100%");
  }
}

export async function createActivity(input: ActivityInput) {
  const user = await getOrCreateDbUser();
  assertWeightsSumTo100(input.weights);

  const [activity] = await db
    .insert(activities)
    .values({ userId: user.id, name: input.name })
    .returning();

  await db.insert(activityCategoryWeights).values(
    input.weights.map((w) => ({
      activityId: activity.id,
      categoryId: w.categoryId,
      weightPercent: w.weightPercent,
    })),
  );

  revalidatePath("/config");
}

export async function updateActivity(id: string, input: ActivityInput) {
  const user = await getOrCreateDbUser();
  assertWeightsSumTo100(input.weights);

  const existing = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.userId, user.id)),
  });
  if (!existing) throw new Error("Activity not found");

  await db.update(activities).set({ name: input.name }).where(eq(activities.id, id));
  await db.delete(activityCategoryWeights).where(eq(activityCategoryWeights.activityId, id));
  await db.insert(activityCategoryWeights).values(
    input.weights.map((w) => ({
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
