import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { suggestPlaces } from "../../../lib/travel/places";

/**
 * Addresses matching what has been typed so far.
 *
 * Behind the session because the maps key is ours — the same reason as `/mobile/travel`. With no
 * key configured it answers an empty list rather than an error: the field still takes a typed
 * address, it just stops helping.
 */
export default handler(
  {
    body: {
      query: z.string().max(240),
      /** Every keystroke in one field is one session, as far as Google's billing is concerned. */
      sessionToken: z.string().max(64).optional(),
    },
  },
  async ({ body, event }) => {
    await getDbUserForRequest(event);
    try {
      return { suggestions: await suggestPlaces(body) };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
