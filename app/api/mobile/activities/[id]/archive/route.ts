import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireDbUser();
  if (error) return error;

  await db
    .update(activities)
    .set({ archived: true })
    .where(and(eq(activities.id, id), eq(activities.userId, user.id)));

  return NextResponse.json({ ok: true });
}
