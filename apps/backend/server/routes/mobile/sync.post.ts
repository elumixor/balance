import { mutationSchema, sinceSchema } from "@balance/synced/server";
import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../lib/api-error";
import { getDbUserForRequest } from "../../lib/current-user";
import { syncServer } from "../../lib/sync";

/**
 * One round trip for every model at once: the writes the client has made since it last heard from
 * us go up, and everything that changed — here or on another device — comes back.
 *
 * Deliberately one endpoint rather than one per model. A screen's reads and its writes are decided
 * together, so they can't disagree about what the server holds, and a burst of edits across three
 * screens costs a single request.
 */
export default handler(
  {
    body: {
      since: sinceSchema,
      mutations: z.array(mutationSchema),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      return await syncServer.handle(user.id, body);
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
