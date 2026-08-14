import { handler } from "@elumixor/nitro-client/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../db";
import { categories } from "../../../../db/schema";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { CategoryService } from "../../../../lib/categories-service";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { CategoryDTO } from "../../../../lib/dto";

export default handler(
  {
    body: {
      name: z.string().trim().min(1),
      color: z.string().trim().min(1),
      targetHoursPerWeek: z.number(),
    },
  },
  async ({ body, router, event }) => {
    const id = router.id;
    const user = await getDbUserForRequest(event);

    try {
      const existing = await db.query.categories.findFirst({
        where: and(eq(categories.id, id), eq(categories.userId, user.id)),
      });
      if (!existing) throw new ApiError("Category not found", 404);
      if (existing.isBuffer) {
        throw new ApiError("The Buffer category is system-managed and can't be edited directly", 403);
      }

      const updated = await new CategoryService(user.id).update(id, body);
      return { category: new CategoryDTO(updated) };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
