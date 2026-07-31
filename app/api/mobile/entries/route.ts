import { and, desc, eq, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { activities, entries } from "@/db/schema";
import { jsonError, requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

export type EntryDTO = {
  id: string;
  activityId: string;
  activityName: string;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
};

function serializeEntry(e: {
  id: string;
  activityId: string;
  startedAt: Date;
  endedAt: Date | null;
  note: string | null;
  activity: { name: string };
}): EntryDTO {
  return {
    id: e.id,
    activityId: e.activityId,
    activityName: e.activity.name,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt ? e.endedAt.toISOString() : null,
    note: e.note,
  };
}

/** GET /api/mobile/entries?limit=20 - recent entries plus recent/frequent activity id lists. Mirrors getTrackData(). */
export async function GET(req: NextRequest) {
  const { user, error } = await requireDbUser();
  if (error) return error;

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

  const recentEntries = await db.query.entries.findMany({
    where: eq(entries.userId, user.id),
    orderBy: [desc(entries.startedAt)],
    limit,
    with: { activity: true },
  });

  const recentActivityRows = await db.query.entries.findMany({
    where: eq(entries.userId, user.id),
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const frequentRows = await db
    .select({
      activityId: entries.activityId,
      name: activities.name,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(entries)
    .innerJoin(activities, eq(activities.id, entries.activityId))
    .where(and(eq(entries.userId, user.id), gte(entries.startedAt, thirtyDaysAgo), eq(activities.archived, false)))
    .groupBy(entries.activityId, activities.name)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  return NextResponse.json({
    entries: recentEntries.map(serializeEntry),
    recentActivities,
    frequentActivities: frequentRows.map((r) => ({ id: r.activityId, name: r.name })),
  });
}

type ManualEntryBody = {
  activityId: string;
  startedAt: string;
  endedAt: string;
  note?: string | null;
};

function parseBody(body: unknown): ManualEntryBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.activityId !== "string" || !b.activityId) return null;
  if (typeof b.startedAt !== "string" || typeof b.endedAt !== "string") return null;
  if (b.note !== undefined && b.note !== null && typeof b.note !== "string") return null;
  return { activityId: b.activityId, startedAt: b.startedAt, endedAt: b.endedAt, note: b.note as string | null };
}

function parseAndValidate(input: ManualEntryBody) {
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

/** POST /api/mobile/entries - create a manually-logged, already-finished entry. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireDbUser();
  if (error) return error;

  const input = parseBody(await req.json().catch(() => null));
  if (!input) return jsonError("Invalid entry payload");

  let range: { startedAt: Date; endedAt: Date };
  try {
    range = parseAndValidate(input);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Invalid entry payload");
  }

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, input.activityId), eq(activities.userId, user.id)),
  });
  if (!activity) return jsonError("Activity not found", 404);

  const [created] = await db
    .insert(entries)
    .values({
      userId: user.id,
      activityId: input.activityId,
      startedAt: range.startedAt,
      endedAt: range.endedAt,
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .returning();

  return NextResponse.json(
    { entry: serializeEntry({ ...created, activity }) },
    { status: 201 },
  );
}
