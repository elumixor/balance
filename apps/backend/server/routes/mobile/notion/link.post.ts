import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/**
 * This project, and what it is in Notion — a page, or the database its tasks live in. The tasks
 * are pulled straight away, because a link nobody sees the result of is a link nobody trusts.
 */
export default authed(
  { body: { projectId: z.uuid(), id: z.string().trim().min(1), kind: z.enum(["page", "database"]) } },
  async ({ body, user }) => new NotionService(user.id).link(body.projectId, { id: body.id, kind: body.kind }),
);
