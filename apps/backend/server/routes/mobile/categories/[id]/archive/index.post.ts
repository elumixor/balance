import { and, eq } from "drizzle-orm";
import { getRouterParam } from "h3";
import { db } from "../../../../../db";
import { categories } from "../../../../../db/schema";
import { ApiError } from "../../../../../lib/api-error";
import { syncBufferCategory } from "../../../../../lib/buffer-category";
import { getDbUserForRequest } from "../../../../../lib/current-user";
import { defineApiHandler } from "../../../../../lib/handler";

export default defineApiHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const user = await getDbUserForRequest(event);

  const existing = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), eq(categories.userId, user.id)),
  });
  if (!existing) throw new ApiError("Category not found", 404);
  if (existing.isBuffer) {
    throw new ApiError("The Rest + Buffer category is system-managed and can't be archived directly", 403);
  }

  await db
    .update(categories)
    .set({ archived: true })
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));

  await syncBufferCategory(user.id);

  return { ok: true };
});
