import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { TrackingSessionsService } from "../../../../lib/tracking/sessions-service";

/**
 * Stopping nothing is not a mistake — a stale watch face can ask twice — so `stopped` is null.
 * `candidates` are the planned events the timer might have been for, best first, for the wrist to
 * ask about; answering one is `POST /mobile/tracking/match`.
 */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const result = await new TrackingSessionsService(user.id).stop();
    return { active: null, stopped: result?.stopped ?? null, candidates: result?.candidates ?? [] };
  } catch (e) {
    return handleApiError(event, e);
  }
});
