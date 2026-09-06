import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";

/**
 * "Yes, that was the one": a finished timer is folded into the planned event it was for. The
 * timer's own event leaves the calendar, and the planned one carries the hours from then on.
 */
export default authed(
  { body: { sessionId: z.string().min(1), calendarId: z.string().min(1), eventId: z.string().min(1) } },
  async ({ body, user }) => {
    const session = await new TrackingSessionsService(user.id).match(body.sessionId, body.calendarId, body.eventId);
    return { session };
  },
);
