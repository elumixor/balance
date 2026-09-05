import { handler } from "@elumixor/nitro-client/server";
import { setResponseHeader } from "h3";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { staticMap } from "../../../lib/travel/places";

/**
 * A small map around a point, inline as a data URL — the maps key stays here, and an `<img>`
 * can't send the session header anyway. Null when Google won't draw one, and the card shows no map.
 */
export default handler(
  {
    body: {
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      /** The size the map is drawn at, in CSS pixels; it comes back at twice that. */
      width: z.number().int().min(80).max(640).default(320),
      height: z.number().int().min(60).max(400).default(140),
      /** Painted for the app's dark ground rather than dimmed after the fact. */
      dark: z.boolean().default(false),
    },
  },
  async ({ body, event }) => {
    await getDbUserForRequest(event);
    try {
      const image = await staticMap(body);
      setResponseHeader(event, "cache-control", "private, max-age=86400");
      return { image };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
