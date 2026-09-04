import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { PreferencesService } from "../../../lib/preferences-service";

/** How this account wants to be reminded, and how it gets around. */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    return await new PreferencesService(user.id).get();
  } catch (e) {
    return handleApiError(event, e);
  }
});
