import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../lib/api-error";
import { deviceGrantService } from "../../../../lib/device-grants";

/** Sign-out on the device: the grant goes with the session, or the next launch undoes it. */
export default handler({ body: { token: z.string().min(1) } }, async ({ body, event }) => {
  try {
    await deviceGrantService.revoke(body.token);
    return { revoked: true };
  } catch (e) {
    return handleApiError(event, e);
  }
});
