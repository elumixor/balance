import { handler } from "@elumixor/nitro-client/server";
import { setResponseHeader } from "h3";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { TRAVEL_MODES, travelTimes } from "../../../lib/travel";

/**
 * How long it takes to get to an event, the ways you'd consider going.
 *
 * Behind the session because the maps key is ours: the answer isn't private, but the quota is.
 */
export default handler(
  {
    body: {
      origin: z.string().min(1),
      destination: z.string().min(1),
      modes: z.array(z.enum(TRAVEL_MODES)).min(1).max(TRAVEL_MODES.length),
      /** The event's start, for the modes that can work backwards from it. */
      arriveBy: z.string().optional(),
    },
  },
  async ({ body, event }) => {
    await getDbUserForRequest(event);
    try {
      const arriveBy = body.arriveBy ? new Date(body.arriveBy) : undefined;
      const answer = await travelTimes({
        origin: body.origin,
        destination: body.destination,
        modes: body.modes,
        arriveBy: arriveBy && !Number.isNaN(arriveBy.getTime()) ? arriveBy : undefined,
      });
      setResponseHeader(event, "cache-control", "private, max-age=300");
      return answer;
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
