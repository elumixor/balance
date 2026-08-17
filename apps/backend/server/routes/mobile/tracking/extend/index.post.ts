import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { TrackingSessionsService } from "../../../../lib/tracking/sessions-service";

/** The duration is measured from when the session started, not from now — "make it 90 minutes". */
export default handler({ body: { durationMinutes: z.number().int().positive() } }, async ({ body, event }) => {
  const user = await getDbUserForRequest(event);
  try {
    return { active: await new TrackingSessionsService(user.id).extend(body.durationMinutes) };
  } catch (e) {
    return handleApiError(event, e);
  }
});
