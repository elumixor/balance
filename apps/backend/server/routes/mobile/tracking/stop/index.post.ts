import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { TrackingSessionsService } from "../../../../lib/tracking/sessions-service";

/** Stopping nothing is not a mistake — a stale watch face can ask twice — so `stopped` is null. */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const stopped = await new TrackingSessionsService(user.id).stop();
    return { active: null, stopped };
  } catch (e) {
    return handleApiError(event, e);
  }
});
