import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import type { H3Event } from "h3";
import { db } from "../db";
import { users } from "../db/schema";
import { ApiError } from "./api-error";

type DbUser = typeof users.$inferSelect;

export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
  publishableKey: "pk_test_Y2VudHJhbC1jb25kb3ItMzguY2xlcmsuYWNjb3VudHMuZGV2JA",
});

/**
 * Signing in as somebody without signing in, for a simulator.
 *
 * A real sign-in in the iOS simulator means a Google consent screen in a webview on every clean
 * install, which is a minute of clicking before anything can be looked at. With `DEV_AUTH_EMAIL`
 * set, every request is that account instead — the real Clerk user, so the real `users` row and
 * the real calendar, not a fixture.
 *
 * Fenced twice, and the fence is the whole reason this is safe to have: a production build and
 * anything running on Vercel ignore the variable completely. So the worst a copy of it in a
 * deployed environment can do is nothing at all.
 */
function devAuthEmail() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) return null;
  return process.env.DEV_AUTH_EMAIL?.trim() || null;
}

/**
 * Verifies the request's `Authorization: Bearer <session-token>` header against Clerk,
 * then looks up (or JIT-provisions) the internal `users` row for that Clerk identity —
 * mirrors the web app's cookie-or-bearer session handling, but explicit since Nitro
 * has no built-in Clerk middleware.
 */
export class AuthService {
  async resolveUser(event: H3Event): Promise<DbUser> {
    const clerkUserId = await this.authenticate(event);
    return this.findOrProvisionUser(clerkUserId);
  }

  /** Looked up once: it is the same account for the life of the process. */
  #devUserId: Promise<string> | null = null;

  private async authenticate(event: H3Event): Promise<string> {
    const email = devAuthEmail();
    if (email) return this.#devUser(email);

    const authHeader = event.headers.get("authorization") ?? event.headers.get("Authorization");
    const token = authHeader?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new ApiError("Not authenticated", 401);

    const requestState = await clerkClient.authenticateRequest(
      new Request("https://balance-app.internal/", {
        headers: { authorization: `Bearer ${token}` },
      }),
      { acceptsToken: "session_token" },
    );

    const auth = requestState.toAuth();
    if (!auth?.userId) throw new ApiError("Not authenticated", 401);
    return auth.userId;
  }

  /** The Clerk id behind `DEV_AUTH_EMAIL`, so the bypass lands on the same row a sign-in would. */
  #devUser(email: string) {
    this.#devUserId ??= clerkClient.users.getUserList({ emailAddress: [email], limit: 1 }).then((page) => {
      const user = page.data[0];
      if (!user) throw new ApiError(`DEV_AUTH_EMAIL is set to ${email}, which is not a Clerk user`, 401);
      console.warn(`[auth] DEV_AUTH_EMAIL is on — every request is ${email}`);
      return user.id;
    });
    return this.#devUserId;
  }

  private async findOrProvisionUser(clerkId: string): Promise<DbUser> {
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
    if (!afterConflict) throw new ApiError("Failed to provision user", 500);
    return afterConflict;
  }
}

export const authService = new AuthService();
export const getDbUserForRequest = (event: H3Event) => authService.resolveUser(event);
