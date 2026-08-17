import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { TrackingSessionsService } from "../../../../lib/tracking/sessions-service";

/** What the watch asks on every wake: is a timer running, and what is it pointed at. */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    return { active: await new TrackingSessionsService(user.id).current() };
  } catch (e) {
    return handleApiError(event, e);
  }
});
