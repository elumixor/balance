import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { entries } from "@/db/schema";
import { requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

/** POST /api/mobile/timer/stop - stop the currently running entry for the signed-in user, if any. */
export async function POST() {
  const { user, error } = await requireDbUser();
  if (error) return error;

  const now = new Date();

  await db
    .update(entries)
    .set({ endedAt: now })
    .where(and(eq(entries.userId, user.id), isNull(entries.endedAt)));

  return NextResponse.json({ ok: true });
}
