import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "~/db";
import { deviceGrants } from "~/db/schema";
import { NotAuthenticatedError } from "~/lib/http/api-error";
import { clerkClient } from "./service";

/** Long enough that a device signs in about as often as it is reinstalled. */
const GRANT_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const SECRET_BYTES = 32;
/** The ticket is redeemed by the same webview a moment later; a minute covers a slow network. */
const TICKET_LIFETIME_SECONDS = 60;

function hash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function expiry() {
  return new Date(Date.now() + GRANT_LIFETIME_MS);
}

/**
 * The device's standing permission to sign itself back in, kept as a hash so the database never
 * holds anything that could be replayed.
 */
class DeviceGrantService {
  /** Issues a grant to a device that has just proved it holds a session. */
  async issue(userId: string) {
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    await db.insert(deviceGrants).values({ userId, tokenHash: hash(secret), expiresAt: expiry() });
    return secret;
  }

  /**
   * Spends a grant: mints the sign-in ticket the app redeems, and hands back a fresh secret that
   * replaces the one just used, so a leaked copy stops working the moment the device signs in.
   */
  async redeem(secret: string) {
    const grant = await db.query.deviceGrants.findFirst({
      where: and(eq(deviceGrants.tokenHash, hash(secret)), gt(deviceGrants.expiresAt, new Date())),
      with: { user: true },
    });
    if (!grant) throw new NotAuthenticatedError("This device is no longer signed in");

    const rotated = randomBytes(SECRET_BYTES).toString("base64url");
    await db
      .update(deviceGrants)
      .set({ tokenHash: hash(rotated), lastUsedAt: new Date(), expiresAt: expiry() })
      .where(eq(deviceGrants.id, grant.id));

    const signInToken = await clerkClient.signInTokens.createSignInToken({
      userId: grant.user.clerkId,
      expiresInSeconds: TICKET_LIFETIME_SECONDS,
    });
    return { ticket: signInToken.token, token: rotated };
  }

  /** Sign-out. Unknown secrets are not an error — the device wanted it gone either way. */
  async revoke(secret: string) {
    await db.delete(deviceGrants).where(eq(deviceGrants.tokenHash, hash(secret)));
  }
}

export const deviceGrantService = new DeviceGrantService();
