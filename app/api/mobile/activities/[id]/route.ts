import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { activities, activityCategoryWeights } from "@/db/schema";
import { resolveWeightsWithBufferRemainder, serializeActivity } from "@/app/api/mobile/activities/route";
import type { ActivityWeightInput } from "@/app/api/mobile/activities/route";
import { jsonError, requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

function parseBody(body: unknown): { name: string; weights: ActivityWeightInput[] } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  if (!Array.isArray(b.weights)) return null;
  const weights: ActivityWeightInput[] = [];
  for (const w of b.weights) {
    if (typeof w !== "object" || w === null) return null;
    const wo = w as Record<string, unknown>;
    if (typeof wo.categoryId !== "string" || typeof wo.weightPercent !== "number") return null;
    weights.push({ categoryId: wo.categoryId, weightPercent: wo.weightPercent });
  }
  return { name: b.name, weights };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireDbUser();
  if (error) return error;

  const input = parseBody(await req.json().catch(() => null));
  if (!input) return jsonError("Invalid activity payload");

  const existing = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.userId, user.id)),
  });
  if (!existing) return jsonError("Activity not found", 404);

  let weights: ActivityWeightInput[];
  try {
    weights = await resolveWeightsWithBufferRemainder(user.id, input.weights);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Invalid weights");
  }

  await db.update(activities).set({ name: input.name }).where(eq(activities.id, id));
  await db.delete(activityCategoryWeights).where(eq(activityCategoryWeights.activityId, id));
  if (weights.length > 0) {
    await db.insert(activityCategoryWeights).values(
      weights.map((w) => ({
        activityId: id,
        categoryId: w.categoryId,
        weightPercent: w.weightPercent,
      })),
    );
  }

  const updated = await db.query.activities.findFirst({
    where: eq(activities.id, id),
    with: { weights: true },
  });
  if (!updated) return jsonError("Activity not found", 404);

  return NextResponse.json({ activity: serializeActivity(updated) });
}
