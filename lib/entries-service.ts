import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, entries } from "@/db/schema";

export type ManualEntryInput = {
  activityId: string;
  startedAt: string;
  endedAt: string;
  note?: string | null;
};

function parseAndValidate(input: ManualEntryInput) {
  if (!input.activityId) throw new Error("Activity is required");

  const startedAt = new Date(input.startedAt);
  const endedAt = new Date(input.endedAt);

  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    throw new Error("Invalid start or end date");
  }
  if (endedAt.getTime() <= startedAt.getTime()) {
    throw new Error("End time must be after start time");
  }

  return { startedAt, endedAt };
}

/** Start a new timer for the given activity, closing any currently running entry first. */
export async function startTimerForUser(userId: string, activityId: string) {
  if (!activityId) throw new Error("Activity is required");

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, activityId), eq(activities.userId, userId)),
  });
  if (!activity) throw new Error("Activity not found");

  const now = new Date();

  // neon-http has no multi-statement transaction support; run sequentially.
  // Safe in practice: a user only ever has one browser/device driving their own timer.
  await db
    .update(entries)
    .set({ endedAt: now })
    .where(and(eq(entries.userId, userId), isNull(entries.endedAt)));

  const [created] = await db
    .insert(entries)
    .values({ userId, activityId, startedAt: now, endedAt: null })
    .returning();

  return created;
}

/** Stop the currently running entry for the signed-in user, if any. */
export async function stopTimerForUser(userId: string) {
  const now = new Date();
  await db
    .update(entries)
    .set({ endedAt: now })
    .where(and(eq(entries.userId, userId), isNull(entries.endedAt)));
}

/** Create a manually-logged, already-finished entry. */
export async function createManualEntryForUser(userId: string, input: ManualEntryInput) {
  const { startedAt, endedAt } = parseAndValidate(input);

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, input.activityId), eq(activities.userId, userId)),
  });
  if (!activity) throw new Error("Activity not found");

  const [created] = await db
    .insert(entries)
    .values({
      userId,
      activityId: input.activityId,
      startedAt,
      endedAt,
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .returning();

  return created;
}

/** Update an existing (finished) entry. */
export async function updateEntryForUser(userId: string, entryId: string, input: ManualEntryInput) {
  const { startedAt, endedAt } = parseAndValidate(input);

  const existing = await db.query.entries.findFirst({
    where: and(eq(entries.id, entryId), eq(entries.userId, userId)),
  });
  if (!existing) throw new Error("Entry not found");

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, input.activityId), eq(activities.userId, userId)),
  });
  if (!activity) throw new Error("Activity not found");

  await db
    .update(entries)
    .set({
      activityId: input.activityId,
      startedAt,
      endedAt,
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)));
}

/** Delete an entry. */
export async function deleteEntryForUser(userId: string, entryId: string) {
  await db.delete(entries).where(and(eq(entries.id, entryId), eq(entries.userId, userId)));
}

/** Fetch everything the /track page needs, scoped to the signed-in user. */
export async function getTrackDataForUser(userId: string) {
  const [runningEntry, allActivities, recentEntries] = await Promise.all([
    db.query.entries.findFirst({
      where: and(eq(entries.userId, userId), isNull(entries.endedAt)),
      with: { activity: true },
    }),
    db.query.activities.findMany({
      where: and(eq(activities.userId, userId), eq(activities.archived, false)),
      orderBy: (a, { asc }) => [asc(a.name)],
    }),
    db.query.entries.findMany({
      where: eq(entries.userId, userId),
      orderBy: [desc(entries.startedAt)],
      limit: 20,
      with: { activity: true },
    }),
  ]);

  // Recent (last 5 distinct activities used, most recent first).
  const recentActivityRows = await db.query.entries.findMany({
    where: eq(entries.userId, userId),
    orderBy: [desc(entries.startedAt)],
    limit: 100,
    with: { activity: true },
  });
  const seen = new Set<string>();
  const recentActivities: { id: string; name: string }[] = [];
  for (const row of recentActivityRows) {
    if (row.activity.archived) continue;
    if (seen.has(row.activityId)) continue;
    seen.add(row.activityId);
    recentActivities.push({ id: row.activity.id, name: row.activity.name });
    if (recentActivities.length >= 5) break;
  }

  // Frequent (top 5 by entry count in last 30 days).
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const frequentRows = await db
    .select({
      activityId: entries.activityId,
      name: activities.name,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(entries)
    .innerJoin(activities, eq(activities.id, entries.activityId))
    .where(and(eq(entries.userId, userId), gte(entries.startedAt, thirtyDaysAgo), eq(activities.archived, false)))
    .groupBy(entries.activityId, activities.name)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  return {
    runningEntry: runningEntry ?? null,
    activities: allActivities,
    recentEntries,
    recentActivities,
    frequentActivities: frequentRows.map((r) => ({ id: r.activityId, name: r.name })),
  };
}
