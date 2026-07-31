import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { activities, activityCategoryWeights } from "@/db/schema";
import { ensureBufferCategory } from "@/lib/buffer-category";
import { jsonError, requireDbUser } from "@/lib/mobile-api";

export const runtime = "nodejs";

export type ActivityWeightDTO = { categoryId: string; weightPercent: number };
export type ActivityDTO = {
  id: string;
  name: string;
  archived: boolean;
  weights: ActivityWeightDTO[];
};

export function serializeActivity(a: {
  id: string;
  name: string;
  archived: boolean;
  weights: (typeof activityCategoryWeights.$inferSelect)[];
}): ActivityDTO {
  return {
    id: a.id,
    name: a.name,
    archived: a.archived,
    weights: a.weights.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent })),
  };
}

export async function GET() {
  const { user, error } = await requireDbUser();
  if (error) return error;

  const rows = await db.query.activities.findMany({
    where: and(eq(activities.userId, user.id), eq(activities.archived, false)),
    orderBy: asc(activities.createdAt),
    with: { weights: true },
  });

  return NextResponse.json({ activities: rows.map(serializeActivity) });
}

export type ActivityWeightInput = { categoryId: string; weightPercent: number };

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

/**
 * Explicit weights may leave time unassigned - that remainder implicitly belongs to the
 * user's Rest + Buffer category, so an activity with no weights at all is 100% free time.
 * Mirrors resolveWeightsWithBufferRemainder in app/(app)/config/actions.ts.
 */
export async function resolveWeightsWithBufferRemainder(userId: string, weights: ActivityWeightInput[]) {
  const explicitTotal = weights.reduce((sum, w) => sum + w.weightPercent, 0);
  if (explicitTotal > 100) {
    throw new Error("Category weights can't add up to more than 100%");
  }

  const remainder = 100 - explicitTotal;
  if (remainder <= 0) return weights;

  const buffer = await ensureBufferCategory(userId);
  return [...weights, { categoryId: buffer.id, weightPercent: remainder }];
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireDbUser();
  if (error) return error;

  const input = parseBody(await req.json().catch(() => null));
  if (!input) return jsonError("Invalid activity payload");

  let weights: ActivityWeightInput[];
  try {
    weights = await resolveWeightsWithBufferRemainder(user.id, input.weights);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Invalid weights");
  }

  const [activity] = await db.insert(activities).values({ userId: user.id, name: input.name }).returning();

  if (weights.length > 0) {
    await db.insert(activityCategoryWeights).values(
      weights.map((w) => ({
        activityId: activity.id,
        categoryId: w.categoryId,
        weightPercent: w.weightPercent,
      })),
    );
  }

  const created = await db.query.activities.findFirst({
    where: eq(activities.id, activity.id),
    with: { weights: true },
  });
  if (!created) return jsonError("Failed to create activity", 500);

  return NextResponse.json({ activity: serializeActivity(created) }, { status: 201 });
}
