import { and, eq } from "drizzle-orm";
import { getRouterParam, readBody } from "h3";
import { db } from "../../../../db";
import { categories } from "../../../../db/schema";
import { ApiError } from "../../../../lib/api-error";
import { syncBufferCategory } from "../../../../lib/buffer-category";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { serializeCategory } from "../../../../lib/dto";
import { defineApiHandler } from "../../../../lib/handler";

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
  const id = getRouterParam(event, "id")!;
  const user = await getDbUserForRequest(event);

  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, user.id)),
  });
  if (!existing) throw new ApiError("Category not found", 404);
  if (existing.isBuffer) {
    throw new ApiError("The Rest + Buffer category is system-managed and can't be edited directly", 403);
  }

  const input = parseBody(await readBody(event).catch(() => null));

  await db
    .update(categories)
    .set({ name: input.name, color: input.color, targetHoursPerWeek: input.targetHoursPerWeek.toString() })
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  await syncBufferCategory(user.id);

  const updated = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, user.id)),
  });
  if (!updated) throw new ApiError("Category not found", 404);

  return { category: serializeCategory(updated) };
});
