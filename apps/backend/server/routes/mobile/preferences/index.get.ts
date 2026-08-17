import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { PreferencesService } from "../../../lib/preferences-service";
import { travelAvailable } from "../../../lib/travel";

/** How this account wants to be reminded, and how it gets around. */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const preferences = await new PreferencesService(user.id).get();
    // Said here rather than discovered by asking for a journey and getting nothing back: the
    // settings panel has to be able to explain why travel times aren't on offer.
    return { ...preferences, travelAvailable: travelAvailable() };
  } catch (e) {
    return handleApiError(event, e);
  }
});
