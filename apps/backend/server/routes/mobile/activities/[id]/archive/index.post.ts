import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../../lib/api-error";
import { ActivityService } from "../../../../../lib/categories-service";
import { getDbUserForRequest } from "../../../../../lib/current-user";

export default handler(async ({ router, event }) => {
  const id = router.id;
  const user = await getDbUserForRequest(event);
  try {
    await new ActivityService(user.id).archive(id);
    return { ok: true };
  } catch (e) {
    return handleApiError(event, e);
  }
});
