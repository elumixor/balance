import { and, eq } from "drizzle-orm";
import { getRouterParam, readBody } from "h3";
import { db } from "../../../../db";
import { activities, activityCategoryWeights } from "../../../../db/schema";
import { ApiError } from "../../../../lib/api-error";
import { resolveWeightsWithBufferRemainder, type ActivityWeightInput } from "../../../../lib/categories-service";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { serializeActivity } from "../../../../lib/dto";
import { defineApiHandler } from "../../../../lib/handler";

function parseBody(body: unknown): { name: string; weights: ActivityWeightInput[] } {
  if (typeof body !== "object" || body === null) throw new ApiError("Invalid activity payload");
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) throw new ApiError("Invalid activity payload");
  if (!Array.isArray(b.weights)) throw new ApiError("Invalid activity payload");
  const weights: ActivityWeightInput[] = [];
  for (const w of b.weights) {
    if (typeof w !== "object" || w === null) throw new ApiError("Invalid activity payload");
    const wo = w as Record<string, unknown>;
    if (typeof wo.categoryId !== "string" || typeof wo.weightPercent !== "number") {
      throw new ApiError("Invalid activity payload");
    }
    weights.push({ categoryId: wo.categoryId, weightPercent: wo.weightPercent });
  }
  return { name: b.name, weights };
}

export default defineApiHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const user = await getDbUserForRequest(event);
  const input = parseBody(await readBody(event).catch(() => null));

  const existing = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.userId, user.id)),
  });
  if (!existing) throw new ApiError("Activity not found", 404);

  const weights = await resolveWeightsWithBufferRemainder(user.id, input.weights);

  await db.update(activities).set({ name: input.name }).where(eq(activities.id, id));
  await db.delete(activityCategoryWeights).where(eq(activityCategoryWeights.activityId, id));
  if (weights.length > 0) {
    await db.insert(activityCategoryWeights).values(
      weights.map((w) => ({ activityId: id, categoryId: w.categoryId, weightPercent: w.weightPercent })),
    );
  }

  const updated = await db.query.activities.findFirst({
    where: eq(activities.id, id),
    with: { weights: true },
  });
  if (!updated) throw new ApiError("Activity not found", 404);

  return { activity: serializeActivity(updated) };
});
