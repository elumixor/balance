import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/**
 * The token and the database somebody pasted, checked against Notion before either is kept. The
 * database may arrive as a URL, an id, or an id with dashes — all three are the same thing.
 */
export default authed(
  { body: { token: z.string().trim().min(1), database: z.string().trim().min(1) } },
  async ({ body, user }) => new NotionService(user.id).connect(body.token, body.database),
);
