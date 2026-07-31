"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getOrCreateDbUser } from "@/lib/current-user";

export type ApplyChangeInput = {
  categoryId: string;
  proposedTargetHours: number;
};

export async function applyPlannerChanges(changes: ApplyChangeInput[]) {
  if (changes.length === 0) return { applied: 0 };

  const user = await getOrCreateDbUser();

  let applied = 0;
  for (const change of changes) {
    if (!Number.isFinite(change.proposedTargetHours) || change.proposedTargetHours < 0) continue;

    const result = await db
      .update(categories)
      .set({ targetHoursPerWeek: change.proposedTargetHours.toFixed(2) })
      .where(and(eq(categories.id, change.categoryId), eq(categories.userId, user.id)))
      .returning({ id: categories.id });

    if (result.length > 0) applied += 1;
  }

  revalidatePath("/planner");
  revalidatePath("/config");
  revalidatePath("/stats");

  return { applied };
}
