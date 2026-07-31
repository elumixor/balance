import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { activities, entries } from "@/db/schema";
import { jsonError, requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const existing = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, user.id)),
  });
  if (!existing) return jsonError("Entry not found", 404);

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, input.activityId), eq(activities.userId, user.id)),
  });
  if (!activity) return jsonError("Activity not found", 404);

  await db
    .update(entries)
    .set({
      activityId: input.activityId,
      startedAt: range.startedAt,
      endedAt: range.endedAt,
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .where(and(eq(entries.id, id), eq(entries.userId, user.id)));

  return NextResponse.json({
    entry: {
      id,
      activityId: input.activityId,
      activityName: activity.name,
      startedAt: range.startedAt.toISOString(),
      endedAt: range.endedAt.toISOString(),
      note: input.note?.trim() ? input.note.trim() : null,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireDbUser();
  if (error) return error;

  await db.delete(entries).where(and(eq(entries.id, id), eq(entries.userId, user.id)));

  return NextResponse.json({ ok: true });
}
