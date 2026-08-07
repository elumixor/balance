import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../lib/api-error";
import { ProviderAccountService } from "../../../../lib/calendar/provider-accounts";
import { getDbUserForRequest } from "../../../../lib/current-user";

export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    await new ProviderAccountService(user.id).disconnect("google");
    return { ok: true };
  } catch (e) {
    return handleApiError(event, e);
  }
});
