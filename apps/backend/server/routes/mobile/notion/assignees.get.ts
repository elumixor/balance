import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** Who a task board's assignee property can name, for keeping only some people's tasks. */
export default authed(
  { query: { connectionId: z.uuid(), dataSourceId: z.string().trim().min(1), propertyId: z.string().min(1) } },
  async ({ query, user }) => ({
    people: await new NotionService(user.id).assignees(query.connectionId, query.dataSourceId, query.propertyId),
  }),
);
