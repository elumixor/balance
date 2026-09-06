import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { deviceGrantService } from "~/lib/auth/device-grants";

/**
 * Turns a device grant into a Clerk sign-in ticket. Deliberately unauthenticated: the whole point
 * is that it is called on a launch that has no session yet, and the grant is the credential.
 */
export default handler({ body: { token: z.string().min(1) } }, async ({ body }) =>
  deviceGrantService.redeem(body.token),
);
