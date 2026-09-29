import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

const column = z.string().trim().min(1).nullable();

/**
 * This project, the task database it is written in, and which of its columns mean what. The tasks
 * are pulled straight away, because a link nobody sees the result of is a link nobody trusts.
 */
export default authed(
  {
    body: {
      projectId: z.uuid(),
      connectionId: z.uuid(),
      dataSourceId: z.string().trim().min(1),
      viewId: z.string().trim().min(1).nullable().default(null),
      mapping: z.object({ status: column, dates: column, assignee: column, parent: column }),
    },
  },
  async ({ body: { projectId, ...target }, user }) => new NotionService(user.id).link(projectId, target),
);
