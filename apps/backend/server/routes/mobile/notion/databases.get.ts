import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** Everything one workspace's grant can see, so choosing a database is a list, not a URL. */
export default authed({ query: { connectionId: z.uuid() } }, async ({ query, user }) => ({
  databases: await new NotionService(user.id).databases(query.connectionId),
}));
