import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { deviceGrantService } from "../../../../lib/device-grants";

/**
 * Issues the grant the phone signs itself back in with. Called once a session exists, and again
 * whenever the app finds itself signed in without one — a device that lost its grant would
 * otherwise never get another until the next manual sign-in.
 */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    return { token: await deviceGrantService.issue(user.id) };
  } catch (e) {
    return handleApiError(event, e);
  }
});
