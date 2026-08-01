import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import type { H3Event } from "h3";
import { db } from "../db";
import { users } from "../db/schema";
import { ApiError } from "./api-error";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
  publishableKey: "pk_test_Y2VudHJhbC1jb25kb3ItMzguY2xlcmsuYWNjb3VudHMuZGV2JA",
});

/**
 * Verify the request's `Authorization: Bearer <session-token>` header against Clerk,
 * then look up (or JIT-provision) the internal `users` row for that Clerk identity —
 * mirrors the web app's cookie-or-bearer session handling, but explicit since Nitro
 * has no built-in Clerk middleware.
 */
export async function getDbUserForRequest(event: H3Event) {
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

  const existing = await db.query.users.findFirst({ where: eq(users.clerkId, auth.userId) });
  if (existing) return existing;

  // Concurrent first-time requests (e.g. the app's parallel initial data fetch) can race
  // to insert the same clerkId; let the loser fall back to a plain select instead of 500ing.
  const [created] = await db
    .insert(users)
    .values({ clerkId: auth.userId })
    .onConflictDoNothing({ target: users.clerkId })
    .returning();
  if (created) return created;

  const afterConflict = await db.query.users.findFirst({ where: eq(users.clerkId, auth.userId) });
  if (!afterConflict) throw new ApiError("Failed to provision user", 500);
  return afterConflict;
}
