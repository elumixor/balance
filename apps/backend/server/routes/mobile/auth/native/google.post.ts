import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { googleSignIn } from "~/lib/auth/native-sign-in";

/** A native Google Sign-In, bridged into a Clerk session — see `auth/native-sign-in.ts`. */
export default handler({ body: { idToken: z.string().min(1) } }, async ({ body }) => googleSignIn(body.idToken));
