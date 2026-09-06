import { mutationSchema, sinceSchema } from "@elumixor/synced/server";
import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { syncServer } from "~/lib/sync";

/**
 * One round trip for every model at once: the writes the client has made since it last heard from
 * us go up, and everything that changed — here or on another device — comes back.
 *
 * Deliberately one endpoint rather than one per model. A screen's reads and its writes are decided
 * together, so they can't disagree about what the server holds, and a burst of edits across three
 * screens costs a single request.
 */
export default authed(
  {
    body: {
      since: sinceSchema,
      mutations: z.array(mutationSchema),
    },
  },
  async ({ body, user }) => syncServer.handle(user.id, body),
);
