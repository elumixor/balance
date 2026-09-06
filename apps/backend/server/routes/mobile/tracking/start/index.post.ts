import { setResponseStatus } from "h3";
import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";

/**
 * Starting a timer writes a real event, so unlike the rest of the tracking routes this one has
 * nowhere to go when no calendar is connected, and says so.
 */
export default authed(
  {
    body: {
      categoryId: z.string().min(1),
      /** Absent or null is an open-ended session — it runs until it's stopped. */
      durationMinutes: z.number().int().positive().nullable().optional(),
      title: z.string().trim().optional(),
      /** An event already on the calendar to time, with its qualified calendar id — no new event. */
      eventId: z.string().min(1).optional(),
      calendarId: z.string().min(1).optional(),
    },
  },
  async ({ body, event, user }) => {
    const active = await new TrackingSessionsService(user.id).start(body);
    setResponseStatus(event, 201);
    return { active };
  },
);
