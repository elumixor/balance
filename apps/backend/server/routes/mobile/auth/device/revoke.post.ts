import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { deviceGrantService } from "~/lib/auth/device-grants";

/** Sign-out on the device: the grant goes with the session, or the next launch undoes it. */
export default handler({ body: { token: z.string().min(1) } }, async ({ body }) => {
  await deviceGrantService.revoke(body.token);
  return { revoked: true };
});
