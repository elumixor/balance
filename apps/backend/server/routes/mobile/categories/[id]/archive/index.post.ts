import { handler } from "@elumixor/nitro-client/server";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../db";
import { categories } from "../../../../../db/schema";
import { ApiError, handleApiError } from "../../../../../lib/api-error";
import { CategoryService } from "../../../../../lib/categories-service";
import { getDbUserForRequest } from "../../../../../lib/current-user";

export default handler(async ({ router, event }) => {
  const id = router.id;
  const user = await getDbUserForRequest(event);

  try {
    const existing = await db.query.categories.findFirst({
      where: and(eq(categories.id, id), eq(categories.userId, user.id)),
    });
    if (!existing) throw new ApiError("Category not found", 404);
    if (existing.isBuffer) {
      throw new ApiError("The Buffer category is system-managed and can't be archived directly", 403);
    }

    await new CategoryService(user.id).archive(id);
    return { ok: true };
  } catch (e) {
    return handleApiError(event, e);
  }
});
