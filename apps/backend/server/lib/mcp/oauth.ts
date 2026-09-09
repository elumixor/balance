import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/db";
import { oauthClients, oauthCodes, oauthRefreshTokens } from "~/db/schema";
import { ApiError } from "~/lib/http/api-error";
import { mcpTokenService } from "./tokens";

/**
 * The authorization server for `/mcp`, in as little as the flow can be written in.
 *
 * It exists because a chat client can be given a URL and nothing else: Claude's web connector has
 * no field for a header, so a key made in the settings panel can never reach it. What it issues is
 * the same kind of key — an `mcp_tokens` row — so the endpoint has one idea of what a caller is
 * and the settings list shows a connector beside the keys somebody made by hand.
 *
 * Deliberately small: one grant type and its refresh, public clients only, PKCE required rather
 * than optional, and no scopes worth arguing about — a key is the account, which is exactly what
 * the consent screen says.
 */

/** A minute is plenty for a browser redirect, and a code that outlives its use is a liability. */
const CODE_LIFETIME_MS = 60_000;
/** Short enough that a leaked token is a nuisance; long enough that refreshing is not the norm. */
const ACCESS_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const SECRET_BYTES = 32;

/** The one scope there is. A key can do what the person can do, and the consent screen says so. */
export const SCOPE = "balance";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(SECRET_BYTES).toString("base64url");

/**
 * An OAuth failure is a shape of its own — `{ error, error_description }` with an RFC 6749 code —
 * and clients branch on the code, so this is not an `ApiError` with a sentence in it.
 */
export class OAuthError extends ApiError {
  constructor(
    readonly code: string,
    message: string,
    status = 400,
  ) {
    super(message, status);
    this.name = "OAuthError";
  }
}

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

class McpOAuthService {
  /** RFC 9728: what the resource is, and who says who you are. */
  protectedResourceMetadata(origin: string) {
    return {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ["header"],
    };
  }

  /** RFC 8414. `none` because every client here is a public one — there is no secret to keep. */
  authorizationServerMetadata(origin: string) {
    return {
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/mobile/oauth/token`,
      registration_endpoint: `${origin}/mobile/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [SCOPE],
      resource_indicators_supported: true,
    };
  }

  /**
   * RFC 7591, open registration. A client id on its own can do nothing: it names a redirect and
   * waits for somebody to say yes on a page that needs a session of its own.
   */
  async register(input: { redirectUris: string[]; clientName?: string }) {
    const redirectUris = input.redirectUris.filter((uri) => isSafeRedirect(uri));
    if (redirectUris.length === 0) {
      throw new OAuthError("invalid_redirect_uri", "redirect_uris must be https, or loopback");
    }
    const id = `bal_${secret()}`;
    const [created] = await db
      .insert(oauthClients)
      .values({ id, name: input.clientName?.slice(0, 120) || "An assistant", redirectUris })
      .returning();
    return {
      client_id: created.id,
      client_id_issued_at: Math.floor(created.createdAt.getTime() / 1000),
      client_name: created.name,
      redirect_uris: created.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  /** What the consent screen needs to say — who is asking, and where they would be sent back to. */
  async describeClient(clientId: string, redirectUri: string) {
    const client = await this.#client(clientId, redirectUri);
    return { name: client.name, redirectUri };
  }

  /**
   * The person said yes. Everything the exchange will have to check is written down with the
   * code, because the client that comes back to the token endpoint proves nothing but the PKCE
   * verifier and the redirect it named.
   */
  async approve(userId: string, request: AuthorizeRequest) {
    const client = await this.#client(request.clientId, request.redirectUri);
    if ((request.codeChallengeMethod ?? "S256") !== "S256") {
      throw new OAuthError("invalid_request", "Only the S256 code challenge method is supported");
    }
    if (!request.codeChallenge) throw new OAuthError("invalid_request", "code_challenge is required");

    const code = secret();
    await db.insert(oauthCodes).values({
      codeHash: hash(code),
      userId,
      clientId: client.id,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      scope: request.scope?.trim() || SCOPE,
      resource: request.resource ?? null,
      expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
    });

    const url = new URL(request.redirectUri);
    url.searchParams.set("code", code);
    if (request.state) url.searchParams.set("state", request.state);
    return url.toString();
  }

  /**
   * The person said no. It is still a redirect: a client left on the consent screen has no way to
   * tell "refused" from "the tab was closed", and OAuth has a word for the first one.
   */
  async refuse(request: { clientId: string; redirectUri: string; state?: string }) {
    await this.#client(request.clientId, request.redirectUri);
    const url = new URL(request.redirectUri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "The account holder refused the request");
    if (request.state) url.searchParams.set("state", request.state);
    return url.toString();
  }

  /** The authorization code exchange, PKCE and all. */
  async exchangeCode(input: { code: string; codeVerifier: string; clientId?: string; redirectUri?: string }) {
    const row = await db.query.oauthCodes.findFirst({
      where: and(eq(oauthCodes.codeHash, hash(input.code)), isNull(oauthCodes.usedAt)),
      with: { user: true },
    });
    if (!row || row.expiresAt < new Date()) throw new OAuthError("invalid_grant", "That code is no longer valid");

    // Spent before anything else is done with it: two exchanges racing must not both succeed.
    const [spent] = await db
      .update(oauthCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthCodes.id, row.id), isNull(oauthCodes.usedAt)))
      .returning();
    if (!spent) throw new OAuthError("invalid_grant", "That code has already been used");

    if (input.clientId && input.clientId !== row.clientId) {
      throw new OAuthError("invalid_grant", "That code was issued to a different client");
    }
    if (input.redirectUri && input.redirectUri !== row.redirectUri) {
      throw new OAuthError("invalid_grant", "That redirect doesn't match the one the code was made for");
    }
    if (!verifyChallenge(input.codeVerifier, row.codeChallenge)) {
      throw new OAuthError("invalid_grant", "The code verifier doesn't match");
    }

    return this.#issue(row.userId, row.clientId, row.scope);
  }

  /** Rotating refresh: the row that was used is gone by the time its replacement is handed back. */
  async exchangeRefresh(input: { refreshToken: string; clientId?: string }) {
    const row = await db.query.oauthRefreshTokens.findFirst({
      where: eq(oauthRefreshTokens.tokenHash, hash(input.refreshToken)),
    });
    if (!row || row.expiresAt < new Date()) throw new OAuthError("invalid_grant", "That refresh token is not valid");
    if (input.clientId && input.clientId !== row.clientId) {
      throw new OAuthError("invalid_grant", "That refresh token belongs to a different client");
    }

    const [taken] = await db.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.id, row.id)).returning();
    if (!taken) throw new OAuthError("invalid_grant", "That refresh token has already been used");

    return this.#issue(row.userId, row.clientId, row.scope);
  }

  /**
   * One access token and one refresh token, and the access token is an ordinary MCP key — so the
   * endpoint has one way of knowing who is calling, and the settings list has one row to revoke.
   */
  async #issue(userId: string, clientId: string, scope: string) {
    const client = await db.query.oauthClients.findFirst({ where: eq(oauthClients.id, clientId) });
    // One live key per client per person: a refresh replaces the key rather than leaving a second
    // row saying the same thing in the settings list.
    await mcpTokenService.clearForClient(userId, clientId);

    const issued = await mcpTokenService.issue(userId, client?.name ?? "An assistant", {
      expiresAt: new Date(Date.now() + ACCESS_LIFETIME_MS),
      clientId,
    });
    const refresh = secret();
    await db.insert(oauthRefreshTokens).values({
      tokenHash: hash(refresh),
      userId,
      clientId,
      scope,
      expiresAt: new Date(Date.now() + REFRESH_LIFETIME_MS),
    });

    return {
      access_token: issued.token,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_LIFETIME_MS / 1000),
      refresh_token: refresh,
      scope,
    };
  }

  async #client(clientId: string, redirectUri: string) {
    const client = await db.query.oauthClients.findFirst({ where: eq(oauthClients.id, clientId) });
    if (!client) throw new OAuthError("invalid_client", "That client is not registered here");
    // Exact match, never a prefix: a redirect chosen by the request is how people are phished.
    if (!client.redirectUris.includes(redirectUri)) {
      throw new OAuthError("invalid_request", "That redirect_uri is not registered for this client");
    }
    return client;
  }
}

/** HTTPS anywhere, plain HTTP only back to the machine the client is running on (RFC 8252). */
function isSafeRedirect(uri: string) {
  try {
    const url = new URL(uri);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function verifyChallenge(verifier: string, challenge: string) {
  if (!verifier) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whatever the request calls this deployment — the metadata has to agree with what was typed. */
export function originOf(url: URL) {
  return url.origin;
}

export function oauthErrorBody(error: unknown) {
  if (error instanceof OAuthError)
    return { status: error.status, body: { error: error.code, error_description: error.message } };
  if (error instanceof ApiError)
    return { status: error.status, body: { error: "invalid_request", error_description: error.message } };
  return { status: 500, body: { error: "server_error", error_description: "Something went wrong on our side" } };
}

export const mcpOAuth = new McpOAuthService();
