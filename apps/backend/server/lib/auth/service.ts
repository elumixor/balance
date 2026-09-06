import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import type { H3Event } from "h3";
import { db } from "~/db";
import { users } from "~/db/schema";
import { env, isProduction } from "~/lib/env";
import { NotAuthenticatedError } from "~/lib/http/api-error";

export type DbUser = typeof users.$inferSelect;

export const clerkClient = createClerkClient({
  secretKey: env.CLERK_SECRET_KEY,
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
});

const BEARER = /^Bearer (.+)$/;

/**
 * Verifies the request's `Authorization: Bearer <session-token>` header against Clerk, then looks
 * up (or JIT-provisions) the internal `users` row for that Clerk identity — mirrors the web app's
 * cookie-or-bearer session handling, but explicit since Nitro has no built-in Clerk middleware.
 *
 * Signing in as somebody without signing in, for a simulator: a real sign-in in the iOS simulator
 * means a Google consent screen in a webview on every clean install. With `DEV_AUTH_EMAIL` set,
 * every request is that account instead — the real Clerk user, so the real `users` row and the
 * real calendar, not a fixture. Fenced by `isProduction`, which is the whole reason this is safe
 * to have: a production build and anything running on Vercel ignore the variable completely.
 */
class AuthService {
  /** Looked up once: it is the same account for the life of the process. */
  #devUserId: Promise<string> | null = null;

  async resolveUser(event: H3Event): Promise<DbUser> {
    const clerkUserId = await this.#authenticate(event);
    return this.#findOrProvisionUser(clerkUserId);
  }

  async #authenticate(event: H3Event): Promise<string> {
    const devEmail = isProduction ? null : env.DEV_AUTH_EMAIL;
    if (devEmail) return this.#devUser(devEmail);

    const authHeader = event.headers.get("authorization") ?? event.headers.get("Authorization");
    const token = authHeader?.match(BEARER)?.[1];
    if (!token) throw new NotAuthenticatedError();

    const requestState = await clerkClient.authenticateRequest(
      new Request("https://balance-app.internal/", { headers: { authorization: `Bearer ${token}` } }),
      { acceptsToken: "session_token" },
    );

    const auth = requestState.toAuth();
    if (!auth?.userId) throw new NotAuthenticatedError();
    return auth.userId;
  }

  /** The Clerk id behind `DEV_AUTH_EMAIL`, so the bypass lands on the same row a sign-in would. */
  #devUser(email: string) {
    this.#devUserId ??= clerkClient.users.getUserList({ emailAddress: [email], limit: 1 }).then((page) => {
      const user = page.data[0];
      // A configuration mistake, not a missing session: the app must not bounce to sign-in over it.
      if (!user) throw new Error(`DEV_AUTH_EMAIL is set to ${email}, which is not a Clerk user`);
      console.warn(`[auth] DEV_AUTH_EMAIL is on — every request is ${email}`);
      return user.id;
    });
    return this.#devUserId;
  }

  async #findOrProvisionUser(clerkId: string): Promise<DbUser> {
    const existing = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) });
    if (existing) return existing;

    // Concurrent first-time requests (e.g. the app's parallel initial data fetch) can race
    // to insert the same clerkId; let the loser fall back to a plain select instead of 500ing.
    const [created] = await db
      .insert(users)
      .values({ clerkId })
      .onConflictDoNothing({ target: users.clerkId })
      .returning();
    if (created) return created;

    const afterConflict = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) });
    if (!afterConflict) throw new Error(`Provisioning a user for ${clerkId} wrote nothing and found nothing`);
    return afterConflict;
  }
}

const authService = new AuthService();
export const resolveUser = (event: H3Event) => authService.resolveUser(event);
