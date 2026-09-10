import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/**
 * What the setup dialog collected: which database holds the projects, which sphere they land in,
 * and what the columns beside their names mean. One write, because they are one decision.
 */
export default authed(
  {
    body: {
      dataSourceId: z.string().trim().min(1),
      categoryId: z.uuid(),
      mapping: z.object({
        description: z.string().nullable().default(null),
        fields: z.array(z.string()).default([]),
      }),
    },
  },
  async ({ body, user }) => new NotionService(user.id).configure(body),
);
