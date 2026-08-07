import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { providerAccounts } from "../../db/schema";
import { decryptSecret, encryptSecret } from "../crypto";
import { ProviderNeedsReconnectError, ProviderNotConnectedError } from "./errors";
import { type GoogleIdentity, googleOAuthService, type TokenSet } from "./google/oauth";

export type ProviderAccount = typeof providerAccounts.$inferSelect;

export interface CalendarPrefsInput {
  readonly visibleCalendarIds?: string[];
  readonly writeCalendarId?: string;
}

/** Refresh a little before the token actually dies, so a slow request doesn't run out mid-flight. */
const EXPIRY_MARGIN_MS = 60 * 1000;

/** The stored OAuth grant for one user's connected calendar accounts, and the tokens it yields. */
export class ProviderAccountService {
  constructor(private readonly userId: string) {}

  get(provider: string): Promise<ProviderAccount | undefined> {
    return db.query.providerAccounts.findFirst({
      where: and(eq(providerAccounts.userId, this.userId), eq(providerAccounts.provider, provider)),
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
      .onConflictDoUpdate({ target: [providerAccounts.userId, providerAccounts.provider], set: values })
      .returning();
    return account;
  }

  /** A live access token, refreshed and re-cached when the stored one is spent. */
  async accessToken(provider: string): Promise<string> {
    const account = await this.get(provider);
    if (!account) throw new ProviderNotConnectedError(provider);
    if (account.revokedAt) throw new ProviderNeedsReconnectError(provider);

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
      if (e instanceof ProviderNeedsReconnectError) await this.markRevoked(account.provider);
      throw e;
    }
  }

  async markRevoked(provider: string): Promise<void> {
    await db
      .update(providerAccounts)
      .set({ revokedAt: new Date(), accessTokenEnc: null, accessTokenExpiresAt: null })
      .where(and(eq(providerAccounts.userId, this.userId), eq(providerAccounts.provider, provider)));
  }

  async setPrefs(provider: string, prefs: CalendarPrefsInput): Promise<ProviderAccount> {
    const [updated] = await db
      .update(providerAccounts)
      .set({ ...prefs, updatedAt: new Date() })
      .where(and(eq(providerAccounts.userId, this.userId), eq(providerAccounts.provider, provider)))
      .returning();
    if (!updated) throw new ProviderNotConnectedError(provider);
    return updated;
  }

  /**
   * The event mappings survive on purpose — they key on the provider's own event ids, so
   * reconnecting the same account brings every one of them back.
   */
  async disconnect(provider: string): Promise<void> {
    const account = await this.get(provider);
    if (!account) return;
    await googleOAuthService.revoke(decryptSecret(account.refreshTokenEnc));
    await db.delete(providerAccounts).where(eq(providerAccounts.id, account.id));
  }
}
