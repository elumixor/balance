import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../lib/api-error";
import { ProviderAccountService } from "../../../lib/calendar/provider-accounts";
import { getDbUserForRequest } from "../../../lib/current-user";

/** Connection status only — no token, encrypted or otherwise, ever leaves the backend. */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const account = await new ProviderAccountService(user.id).get("google");
    return {
      integrations: [
        {
          provider: "google",
          connected: Boolean(account) && !account?.revokedAt,
          needsReconnect: Boolean(account?.revokedAt),
          email: account?.email ?? null,
        },
      ],
    };
  } catch (e) {
    return handleApiError(event, e);
  }
});
