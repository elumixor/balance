import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { syncBufferCategory } from "@/lib/buffer-category";
import { jsonError, requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireDbUser();
  if (error) return error;

  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, user.id)),
  });
  if (!existing) return jsonError("Category not found", 404);
  if (existing.isBuffer) {
    return jsonError("The Rest + Buffer category is system-managed and can't be archived directly", 403);
  }

  await db
    .update(categories)
    .set({ archived: true })
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  await syncBufferCategory(user.id);

  return NextResponse.json({ ok: true });
}
