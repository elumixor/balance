import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { syncBufferCategory } from "@/lib/buffer-category";
import { jsonError, requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

export type CategoryDTO = {
  id: string;
  name: string;
  color: string;
  targetHoursPerWeek: number;
  trackingMode: "consistency" | "average";
  isProductiveLoad: boolean;
  isBuffer: boolean;
  archived: boolean;
};

export function serializeCategory(c: typeof categories.$inferSelect): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    color: c.color,
    targetHoursPerWeek: Number(c.targetHoursPerWeek),
    trackingMode: c.trackingMode,
    isProductiveLoad: c.isProductiveLoad,
    isBuffer: c.isBuffer,
    archived: c.archived,
  };
}

export async function GET() {
  const { user, error } = await requireDbUser();
  if (error) return error;

  await syncBufferCategory(user.id);

  const rows = await db.query.categories.findMany({
    where: and(eq(categories.userId, user.id), eq(categories.archived, false)),
    orderBy: asc(categories.createdAt),
  });

  return NextResponse.json({ categories: rows.map(serializeCategory) });
}

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

export async function POST(req: NextRequest) {
  const { user, error } = await requireDbUser();
  if (error) return error;

  const input = parseBody(await req.json().catch(() => null));
  if (!input) return jsonError("Invalid category payload");

  const [created] = await db
    .insert(categories)
    .values({
      userId: user.id,
      name: input.name,
      color: input.color,
      targetHoursPerWeek: input.targetHoursPerWeek.toString(),
      trackingMode: input.trackingMode,
      isProductiveLoad: input.isProductiveLoad,
    })
    .returning();

  await syncBufferCategory(user.id);

  return NextResponse.json({ category: serializeCategory(created) }, { status: 201 });
}
