"use server";

import { revalidatePath } from "next/cache";
import {
  archiveActivityForUser,
  archiveCategoryForUser,
  createActivityForUser,
  createCategoryForUser,
  updateActivityForUser,
  updateCategoryForUser,
} from "@/lib/categories-service";
import { getOrCreateDbUser } from "@/lib/current-user";
import type { ActivityInput, CategoryInput } from "./types";

export async function createCategory(input: CategoryInput) {
  const user = await getOrCreateDbUser();
  await createCategoryForUser(user.id, input);
  revalidatePath("/config");
}

export async function updateCategory(id: string, input: CategoryInput) {
  const user = await getOrCreateDbUser();
  await updateCategoryForUser(user.id, id, input);
  revalidatePath("/config");
}

export async function archiveCategory(id: string) {
  const user = await getOrCreateDbUser();
  await archiveCategoryForUser(user.id, id);
  revalidatePath("/config");
}

export async function createActivity(input: ActivityInput) {
  const user = await getOrCreateDbUser();
  await createActivityForUser(user.id, input);
  revalidatePath("/config");
}

export async function updateActivity(id: string, input: ActivityInput) {
  const user = await getOrCreateDbUser();
  await updateActivityForUser(user.id, id, input);
  revalidatePath("/config");
}

export async function archiveActivity(id: string) {
  const user = await getOrCreateDbUser();
  await archiveActivityForUser(user.id, id);
  revalidatePath("/config");
}
