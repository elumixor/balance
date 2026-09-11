import { setResponseStatus } from "h3";
import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { parseInstant } from "~/lib/http/schemas";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";

/**
 * A timer that ran and finished while the watch had no network, told to the server once it has
 * one again. It is one call rather than a replayed start and stop — see
 * `TrackingSessionsService.log` — and, like `start`, it writes a real event, so it has nowhere to
 * go when no calendar is connected and says so.
 */
export default authed(
  {
    body: {
      categoryId: z.string().min(1),
      startedAt: z.string(),
      endedAt: z.string(),
      title: z.string().trim().optional(),
    },
  },
  async ({ body, event, user }) => {
    const session = await new TrackingSessionsService(user.id).log({
      categoryId: body.categoryId,
      startedAt: parseInstant(body.startedAt, "startedAt"),
      endedAt: parseInstant(body.endedAt, "endedAt"),
      title: body.title,
    });
    setResponseStatus(event, 201);
    return { session };
  },
);
