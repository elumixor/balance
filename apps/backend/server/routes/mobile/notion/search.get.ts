import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** Pages and databases by name, for pointing one project at what it is written on in Notion. */
export default authed({ query: { q: z.string().trim().default("") } }, async ({ query, user }) => ({
  results: await new NotionService(user.id).search(query.q),
}));
