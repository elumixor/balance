import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";

/** The duration is measured from when the session started, not from now — "make it 90 minutes". */
export default authed({ body: { durationMinutes: z.number().int().positive() } }, async ({ body, user }) => ({
  active: await new TrackingSessionsService(user.id).extend(body.durationMinutes),
}));
