import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/**
 * What the import dialog collected for one workspace: which database holds the projects, which
 * sphere they land in, and which column is the sentence under their names. One write, because
 * they are one decision.
 */
export default authed(
  {
    body: {
      connectionId: z.uuid(),
      dataSourceId: z.string().trim().min(1),
      categoryId: z.uuid(),
      mapping: z.object({ description: z.string().nullable().default(null) }),
    },
  },
  async ({ body: { connectionId, ...input }, user }) => new NotionService(user.id).configure(connectionId, input),
);
