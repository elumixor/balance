import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { entries } from "@/db/schema";
import { requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

/** GET /api/mobile/entries/running - the current running entry, or null. */
export async function GET() {
  const { user, error } = await requireDbUser();
  if (error) return error;

  const running = await db.query.entries.findFirst({
    where: and(eq(entries.userId, user.id), isNull(entries.endedAt)),
    with: { activity: true },
  });

  if (!running) return NextResponse.json({ entry: null });

  return NextResponse.json({
    entry: {
      id: running.id,
      activityId: running.activityId,
      activityName: running.activity.name,
      startedAt: running.startedAt.toISOString(),
      endedAt: null,
      note: running.note,
    },
  });
}
