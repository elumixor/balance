import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { suggestPlaces } from "~/lib/travel/places";

/**
 * Addresses matching what has been typed so far.
 *
 * Behind the session because the maps key is ours — the same reason as `/mobile/travel`. With no
 * key configured it answers an empty list rather than an error: the field still takes a typed
 * address, it just stops helping.
 */
export default authed(
  {
    body: {
      query: z.string().max(240),
      /** Every keystroke in one field is one session, as far as Google's billing is concerned. */
      sessionToken: z.string().max(64).optional(),
    },
  },
  async ({ body }) => ({ suggestions: await suggestPlaces(body) }),
);
