import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { activities, entries } from "@/db/schema";
import { jsonError, requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

/** POST /api/mobile/timer/start { activityId } - closes any running entry, starts a new one. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireDbUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const activityId = typeof body === "object" && body !== null ? (body as Record<string, unknown>).activityId : null;
  if (typeof activityId !== "string" || !activityId) return jsonError("activityId is required");

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, activityId), eq(activities.userId, user.id)),
  });
  if (!activity) return jsonError("Activity not found", 404);

  const now = new Date();

  // neon-http has no multi-statement transaction support; run sequentially,
  // mirroring app/(app)/track/actions.ts startTimer.
  await db
    .update(entries)
    .set({ endedAt: now })
    .where(and(eq(entries.userId, user.id), isNull(entries.endedAt)));

  const [created] = await db
    .insert(entries)
    .values({ userId: user.id, activityId, startedAt: now, endedAt: null })
    .returning();

  return NextResponse.json({
    entry: {
      id: created.id,
      activityId: created.activityId,
      activityName: activity.name,
      startedAt: created.startedAt.toISOString(),
      endedAt: null,
      note: created.note,
    },
  });
}
