import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** A database's saved views, for choosing which of its rows are one project's tasks. */
export default authed(
  { query: { connectionId: z.uuid(), dataSourceId: z.string().trim().min(1) } },
  async ({ query, user }) => ({
    views: await new NotionService(user.id).views(query.connectionId, query.dataSourceId),
  }),
);
