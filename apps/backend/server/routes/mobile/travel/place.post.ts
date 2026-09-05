import { handler } from "@elumixor/nitro-client/server";
import { setResponseHeader } from "h3";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { lookupPlace, staticMap } from "../../../lib/travel/places";

/**
 * One place, pinned down: its coordinates, the address as Google spells it, and a small map with
 * a pin on it. Asked once a suggestion is chosen — or for a calendar event's own location, in
 * words — and answers `{ place: null }` when Google knows no such place, which is what "Room 4"
 * gets. The map comes back inline because the maps key must not leave the server.
 */
export default handler(
  {
    body: {
      placeId: z.string().max(200).optional(),
      address: z.string().max(240).optional(),
      /** Closes the autocomplete session the suggestion came from, so Google bills it as one. */
      sessionToken: z.string().max(64).optional(),
      /** The size the map is drawn at, in CSS pixels; it comes back at twice that. */
      width: z.number().int().min(80).max(640).default(320),
      height: z.number().int().min(60).max(400).default(140),
    },
  },
  async ({ body, event }) => {
    await getDbUserForRequest(event);
    try {
      const place = await lookupPlace(body);
      if (!place) return { place: null, map: null };
      const map = await staticMap({ ...place, width: body.width, height: body.height });
      setResponseHeader(event, "cache-control", "private, max-age=86400");
      return { place, map };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
