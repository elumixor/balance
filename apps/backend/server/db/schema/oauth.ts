import { relations } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * The authorization server behind `/mcp`, which exists for one reason: a chat client can be given
 * a URL and nothing else. Claude's web connector has no field for a header, so the only way in is
 * the OAuth dance — the app's own sign-in page asks the person, and what comes back out is the
 * same kind of key the settings panel makes by hand.
 *
 * A client registers itself (RFC 7591) rather than being configured, because the client here is
 * whichever browser tab somebody is adding the connector from, and it has no way to be known in
 * advance. Registration is open and worth nothing on its own: a client id buys the right to ask,
 * and only a signed-in person can answer.
 */
export const oauthClients = pgTable("oauth_clients", {
  /** The `client_id` itself, made here and handed back — not a surrogate key. */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Every redirect this client may be sent back to, matched exactly at both ends of the flow. */
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An authorization code: a person's "yes", worth one token exchange and gone in a minute.
 *
 * Stored as a hash like every other secret here, with the PKCE challenge it was asked for, so the
 * exchange can prove it is the same client that sent the person to the consent screen.
 */
export const oauthCodes = pgTable("oauth_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeHash: text("code_hash").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  /** S256 only — the plain method is not offered, so this is always a hash of the verifier. */
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope").notNull(),
  /** What the token was asked for (RFC 8707), kept so the audience can be checked on exchange. */
  resource: text("resource"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** Set the moment it is spent: a replay has to find the row and refuse, not miss it. */
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/**
 * What a client comes back with when its access token has expired.
 *
 * Rotated on every use, because a client registered this way is a public one and OAuth 2.1 says
 * so: the old row is deleted in the same breath as the new one is written, so a stolen copy is
 * worth one refresh at most and the theft shows up as the real client being signed out.
 */
export const oauthRefreshTokens = pgTable("oauth_refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const oauthCodesRelations = relations(oauthCodes, ({ one }) => ({
  user: one(users, { fields: [oauthCodes.userId], references: [users.id] }),
}));

export const oauthRefreshTokensRelations = relations(oauthRefreshTokens, ({ one }) => ({
  user: one(users, { fields: [oauthRefreshTokens.userId], references: [users.id] }),
}));
