import { handler } from "@elumixor/nitro-client/server";
import { setResponseHeader } from "h3";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { lookupPlace } from "../../../lib/travel/places";

/**
 * One place, pinned down: its coordinates and the address as Google spells it. Asked once a
 * suggestion is chosen — or for a calendar event's own location, in words — and answers
 * `{ place: null }` when Google knows no such place, which is what "Room 4" gets. The map around
 * it is `/mobile/travel/map`, asked with the coordinates this answers.
 */
export default handler(
  {
    body: {
      placeId: z.string().max(200).optional(),
      address: z.string().max(240).optional(),
      /** Closes the autocomplete session the suggestion came from, so Google bills it as one. */
      sessionToken: z.string().max(64).optional(),
    },
  },
  async ({ body, event }) => {
    await getDbUserForRequest(event);
    try {
      const place = await lookupPlace(body);
      setResponseHeader(event, "cache-control", "private, max-age=86400");
      return { place };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
