import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** The link goes; the tasks it brought in stay, because they are this app's records now. */
export default authed({ body: { projectId: z.uuid() } }, async ({ body, user }) =>
  new NotionService(user.id).unlink(body.projectId),
);
