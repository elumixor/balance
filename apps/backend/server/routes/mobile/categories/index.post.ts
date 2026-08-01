import { readBody, setResponseStatus } from "h3";
import { db } from "../../../db";
import { categories } from "../../../db/schema";
import { ApiError } from "../../../lib/api-error";
import { syncBufferCategory } from "../../../lib/buffer-category";
import { getDbUserForRequest } from "../../../lib/current-user";
import { serializeCategory } from "../../../lib/dto";
import { defineApiHandler } from "../../../lib/handler";

type CategoryBody = { name: string; color: string; targetHoursPerWeek: number };

function parseBody(body: unknown): CategoryBody {
  if (typeof body !== "object" || body === null) throw new ApiError("Invalid category payload");
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) throw new ApiError("Invalid category payload");
  if (typeof b.color !== "string" || !b.color.trim()) throw new ApiError("Invalid category payload");
  if (typeof b.targetHoursPerWeek !== "number" || Number.isNaN(b.targetHoursPerWeek)) {
    throw new ApiError("Invalid category payload");
  }
  return { name: b.name, color: b.color, targetHoursPerWeek: b.targetHoursPerWeek };
}

export default defineApiHandler(async (event) => {
  const user = await getDbUserForRequest(event);
  const input = parseBody(await readBody(event).catch(() => null));

  const [created] = await db
    .insert(categories)
    .values({
      userId: user.id,
      name: input.name,
      color: input.color,
      targetHoursPerWeek: input.targetHoursPerWeek.toString(),
    })
    .returning();

  await syncBufferCategory(user.id);

  setResponseStatus(event, 201);
  return { category: serializeCategory(created) };
});
