import { handler } from "@elumixor/nitro-client/server";
import { setResponseStatus } from "h3";
import { z } from "zod";
import { handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { TrackingSessionsService } from "../../../../lib/tracking/sessions-service";

/**
 * Starting a timer writes a real event, so unlike the rest of the tracking routes this one has
 * nowhere to go when no calendar is connected, and says so.
 */
export default handler(
  {
    body: {
      categoryId: z.string().min(1),
      /** Absent or null is an open-ended session — it runs until it's stopped. */
      durationMinutes: z.number().int().positive().nullable().optional(),
      title: z.string().trim().optional(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const active = await new TrackingSessionsService(user.id).start(body);
      setResponseStatus(event, 201);
      return { active };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
