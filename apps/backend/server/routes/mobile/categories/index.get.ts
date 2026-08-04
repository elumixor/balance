import { handler } from "@elumixor/nitro-client/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { categories } from "../../../db/schema";
import { bufferCategoryService } from "../../../lib/buffer-category";
import { getDbUserForRequest } from "../../../lib/current-user";
import { CategoryDTO } from "../../../lib/dto";

export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  await bufferCategoryService.sync(user.id);

  const rows = await db.query.categories.findMany({
    where: and(eq(categories.userId, user.id), eq(categories.archived, false)),
    orderBy: asc(categories.createdAt),
  });

  return { categories: rows.map((c) => new CategoryDTO(c)) };
});
