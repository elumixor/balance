import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "~/db";
import { mcpTokens } from "~/db/schema";
import type { DbUser } from "~/lib/auth/service";
import { NotAuthenticatedError, NotFoundError } from "~/lib/http/api-error";

const SECRET_BYTES = 32;
/** What the key is called on the wire, so a leaked string is recognisable for what it is. */
export const MCP_TOKEN_PREFIX = "balance_mcp_";

function hash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export interface McpTokenSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
}

/**
 * The keys an assistant signs in with, kept as hashes so the database never holds one that could
 * be replayed. The secret exists exactly once — in the answer to the request that made it.
 */
class McpTokenService {
  /** Mints a key for an account that has just proved it holds a session. */
  async issue(userId: string, name: string, expiresAt?: Date) {
    const secret = `${MCP_TOKEN_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`;
    const [created] = await db
      .insert(mcpTokens)
      .values({ userId, name, tokenHash: hash(secret), expiresAt: expiresAt ?? null })
      .returning();
    return { token: secret, key: summarize(created) };
  }

  async list(userId: string): Promise<McpTokenSummary[]> {
    const rows = await db.query.mcpTokens.findMany({
      where: eq(mcpTokens.userId, userId),
      orderBy: desc(mcpTokens.createdAt),
    });
    return rows.map(summarize);
  }

  async revoke(userId: string, id: string) {
    const [deleted] = await db
      .delete(mcpTokens)
      .where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, userId)))
      .returning();
    if (!deleted) throw new NotFoundError("That key is already gone");
  }

  /**
   * The account behind a key, or nothing. `lastUsedAt` is written on the way through — it is the
   * only way anyone can tell whether a key still has something on the other end of it.
   */
  async resolve(secret: string): Promise<DbUser> {
    const row = await db.query.mcpTokens.findFirst({
      where: and(
        eq(mcpTokens.tokenHash, hash(secret)),
        or(isNull(mcpTokens.expiresAt), gt(mcpTokens.expiresAt, new Date())),
      ),
      with: { user: true },
    });
    if (!row) throw new NotAuthenticatedError("That key is not valid");
    await db.update(mcpTokens).set({ lastUsedAt: new Date() }).where(eq(mcpTokens.id, row.id));
    return row.user;
  }
}

function summarize(row: typeof mcpTokens.$inferSelect): McpTokenSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

export const mcpTokenService = new McpTokenService();
