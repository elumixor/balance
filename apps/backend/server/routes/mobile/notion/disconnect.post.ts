import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/** One workspace's grant goes; what it mirrored stays, because those projects are the app's records now. */
export default authed({ body: { connectionId: z.uuid() } }, async ({ body, user }) =>
  new NotionService(user.id).disconnect(body.connectionId),
);
