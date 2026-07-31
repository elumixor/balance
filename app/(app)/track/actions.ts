"use server";

import { revalidatePath } from "next/cache";
import {
  createManualEntryForUser,
  deleteEntryForUser,
  type ManualEntryInput,
  getTrackDataForUser,
  startTimerForUser,
  stopTimerForUser,
  updateEntryForUser,
} from "@/lib/entries-service";
import { getOrCreateDbUser } from "@/lib/current-user";

export async function startTimer(activityId: string) {
  const user = await getOrCreateDbUser();
  await startTimerForUser(user.id, activityId);
  revalidatePath("/track");
}

export async function stopTimer() {
  const user = await getOrCreateDbUser();
  await stopTimerForUser(user.id);
  revalidatePath("/track");
}

export async function createManualEntry(input: ManualEntryInput) {
  const user = await getOrCreateDbUser();
  await createManualEntryForUser(user.id, input);
  revalidatePath("/track");
}

export async function updateEntry(entryId: string, input: ManualEntryInput) {
  const user = await getOrCreateDbUser();
  await updateEntryForUser(user.id, entryId, input);
  revalidatePath("/track");
}

export async function deleteEntry(entryId: string) {
  const user = await getOrCreateDbUser();
  await deleteEntryForUser(user.id, entryId);
  revalidatePath("/track");
}

export async function getTrackData() {
  const user = await getOrCreateDbUser();
  return getTrackDataForUser(user.id);
}
