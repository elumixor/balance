import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { categories } from "../../../db/schema";
import { getDbUserForRequest } from "../../../lib/current-user";
import { serializeCategory } from "../../../lib/dto";
import { defineApiHandler } from "../../../lib/handler";
import { syncBufferCategory } from "../../../lib/buffer-category";

export default defineApiHandler(async (event) => {
  const user = await getDbUserForRequest(event);
  await syncBufferCategory(user.id);

  const rows = await db.query.categories.findMany({
    where: and(eq(categories.userId, user.id), eq(categories.archived, false)),
    orderBy: asc(categories.createdAt),
  });

  return { categories: rows.map(serializeCategory) };
});
