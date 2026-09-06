import { authed } from "~/lib/http/authed";
import { TrackingSessionsService } from "~/lib/tracking/sessions-service";

/**
 * Stopping nothing is not a mistake — a stale watch face can ask twice — so `stopped` is null.
 * `candidates` are the planned events the timer might have been for, best first, for the wrist to
 * ask about; answering one is `POST /mobile/tracking/match`.
 */
export default authed(async ({ user }) => {
  const result = await new TrackingSessionsService(user.id).stop();
  return { active: null, stopped: result?.stopped ?? null, candidates: result?.candidates ?? [] };
});
