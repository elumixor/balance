import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { parseInstant } from "~/lib/http/schemas";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";

/**
 * Stopping nothing is not a mistake — a stale watch face can ask twice — so `stopped` is null.
 * `candidates` are the planned events the timer might have been for, best first, for the wrist to
 * ask about; answering one is `POST /mobile/tracking/match`.
 */
export default authed(
  {
    body: {
      /** When it was actually stopped, for a wrist that had no signal at the time. */
      endedAt: z.string().optional(),
    },
  },
  async ({ body, user }) => {
    const result = await new TrackingSessionsService(user.id).stop(
      body.endedAt ? parseInstant(body.endedAt, "endedAt") : undefined,
    );
    return { active: null, stopped: result?.stopped ?? null, candidates: result?.candidates ?? [] };
  },
);
