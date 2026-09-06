import { and, eq, ne } from "drizzle-orm";
import { db } from "~/db";
import { providerAccounts } from "~/db/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { ProviderNeedsReconnectError, ProviderNotConnectedError } from "./errors";
import { type GoogleIdentity, googleOAuthService, type TokenSet } from "./google/oauth";

export type ProviderAccount = typeof providerAccounts.$inferSelect;

export interface CalendarPrefsInput {
  readonly visibleCalendarIds?: string[];
  readonly writeCalendarId?: string;
}

/** Refresh a little before the token actually dies, so a slow request doesn't run out mid-flight. */
const EXPIRY_MARGIN_MS = 60_000;

/** The stored OAuth grants for one user's connected calendar accounts, and the tokens they yield. */
export class ProviderAccountService {
  constructor(private readonly userId: string) {}

  list(provider: string): Promise<ProviderAccount[]> {
    return db.query.providerAccounts.findMany({
      where: and(eq(providerAccounts.userId, this.userId), eq(providerAccounts.provider, provider)),
    });
  }

  getById(accountId: string): Promise<ProviderAccount | undefined> {
    return db.query.providerAccounts.findFirst({
      where: and(eq(providerAccounts.id, accountId), eq(providerAccounts.userId, this.userId)),
    });
  }

  /** Reconnecting the same account replaces the grant in place, and clears a previous revocation. */
  async connect(provider: string, tokens: TokenSet, identity: GoogleIdentity): Promise<ProviderAccount> {
    if (!tokens.refreshToken) throw new Error("Cannot connect an account without a refresh token");

    const values = {
      userId: this.userId,
      provider,
      externalAccountId: identity.sub,
      email: identity.email ?? null,
      refreshTokenEnc: encryptSecret(tokens.refreshToken),
      accessTokenEnc: encryptSecret(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      revokedAt: null,
      updatedAt: new Date(),
    };

    // neon-http has no transactions, so the upsert has to be the single statement it already is.
    const [account] = await db
      .insert(providerAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: [providerAccounts.userId, providerAccounts.provider, providerAccounts.externalAccountId],
        set: values,
      })
      .returning();
    return account;
  }

  /** A live access token, refreshed and re-cached when the stored one is spent. */
  async accessToken(accountId: string): Promise<string> {
    const account = await this.getById(accountId);
    if (!account) throw new ProviderNotConnectedError("google");
    if (account.revokedAt) throw new ProviderNeedsReconnectError("google");

    const expiresAt = account.accessTokenExpiresAt?.getTime() ?? 0;
    if (account.accessTokenEnc && expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return decryptSecret(account.accessTokenEnc);
    }
    return this.refreshAccessToken(account);
  }

  async refreshAccessToken(account: ProviderAccount): Promise<string> {
    try {
      const tokens = await googleOAuthService.refresh(decryptSecret(account.refreshTokenEnc));
      await db
        .update(providerAccounts)
        .set({
          accessTokenEnc: encryptSecret(tokens.accessToken),
          accessTokenExpiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
          updatedAt: new Date(),
        })
        .where(eq(providerAccounts.id, account.id));
      return tokens.accessToken;
    } catch (e) {
      if (e instanceof ProviderNeedsReconnectError) await this.markRevoked(account.id);
      throw e;
    }
  }

  async markRevoked(accountId: string): Promise<void> {
    await db
      .update(providerAccounts)
      .set({ revokedAt: new Date(), accessTokenEnc: null, accessTokenExpiresAt: null })
      .where(and(eq(providerAccounts.id, accountId), eq(providerAccounts.userId, this.userId)));
  }

  /** A write target is unique across every connected account, so setting one here clears the rest. */
  async setPrefs(accountId: string, prefs: CalendarPrefsInput): Promise<ProviderAccount> {
    if (prefs.writeCalendarId) {
      await db
        .update(providerAccounts)
        .set({ writeCalendarId: null, updatedAt: new Date() })
        .where(and(eq(providerAccounts.userId, this.userId), ne(providerAccounts.id, accountId)));
    }

    const [updated] = await db
      .update(providerAccounts)
      .set({ ...prefs, updatedAt: new Date() })
      .where(and(eq(providerAccounts.id, accountId), eq(providerAccounts.userId, this.userId)))
      .returning();
    if (!updated) throw new ProviderNotConnectedError("google");
    return updated;
  }

  /**
   * The event mappings survive on purpose — they key on the provider's own event ids, so
   * reconnecting the same account brings every one of them back.
   */
  async disconnect(accountId: string): Promise<void> {
    const account = await this.getById(accountId);
    if (!account) return;
    await googleOAuthService.revoke(decryptSecret(account.refreshTokenEnc));
    await db.delete(providerAccounts).where(eq(providerAccounts.id, account.id));
  }
}
