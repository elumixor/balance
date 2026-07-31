import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { serializeCategory } from "@/app/api/mobile/categories/route";
import { syncBufferCategory } from "@/lib/buffer-category";
import { jsonError, requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

type CategoryBody = {
  name: string;
  color: string;
  targetHoursPerWeek: number;
  trackingMode: "consistency" | "average";
  isProductiveLoad: boolean;
};

function parseBody(body: unknown): CategoryBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  if (typeof b.color !== "string" || !b.color.trim()) return null;
  if (typeof b.targetHoursPerWeek !== "number" || Number.isNaN(b.targetHoursPerWeek)) return null;
  if (b.trackingMode !== "consistency" && b.trackingMode !== "average") return null;
  if (typeof b.isProductiveLoad !== "boolean") return null;
  return {
    name: b.name,
    color: b.color,
    targetHoursPerWeek: b.targetHoursPerWeek,
    trackingMode: b.trackingMode,
    isProductiveLoad: b.isProductiveLoad,
  };
}

async function assertNotBuffer(id: string, userId: string) {
  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, userId)),
  });
  if (!existing) return jsonError("Category not found", 404);
  if (existing.isBuffer) return jsonError("The Rest + Buffer category is system-managed and can't be edited directly", 403);
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireDbUser();
  if (error) return error;

  const guardError = await assertNotBuffer(id, user.id);
  if (guardError) return guardError;

  const input = parseBody(await req.json().catch(() => null));
  if (!input) return jsonError("Invalid category payload");

  await db
    .update(categories)
    .set({
      name: input.name,
      color: input.color,
      targetHoursPerWeek: input.targetHoursPerWeek.toString(),
      trackingMode: input.trackingMode,
      isProductiveLoad: input.isProductiveLoad,
    })
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  await syncBufferCategory(user.id);

  const updated = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, user.id)),
  });
  if (!updated) return jsonError("Category not found", 404);

  return NextResponse.json({ category: serializeCategory(updated) });
}
