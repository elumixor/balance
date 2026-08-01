import { eq } from "drizzle-orm";
import { readBody, setResponseStatus } from "h3";
import { db } from "../../../db";
import { activities, activityCategoryWeights } from "../../../db/schema";
import { ApiError } from "../../../lib/api-error";
import { resolveWeightsWithBufferRemainder, type ActivityWeightInput } from "../../../lib/categories-service";
import { getDbUserForRequest } from "../../../lib/current-user";
import { serializeActivity } from "../../../lib/dto";
import { defineApiHandler } from "../../../lib/handler";

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
  const user = await getDbUserForRequest(event);
  const input = parseBody(await readBody(event).catch(() => null));

  const weights = await resolveWeightsWithBufferRemainder(user.id, input.weights);

  const [activity] = await db.insert(activities).values({ userId: user.id, name: input.name }).returning();

  if (weights.length > 0) {
    await db.insert(activityCategoryWeights).values(
      weights.map((w) => ({ activityId: activity.id, categoryId: w.categoryId, weightPercent: w.weightPercent })),
    );
  }

  const created = await db.query.activities.findFirst({
    where: eq(activities.id, activity.id),
    with: { weights: true },
  });
  if (!created) throw new ApiError("Failed to create activity", 500);

  setResponseStatus(event, 201);
  return { activity: serializeActivity(created) };
});
