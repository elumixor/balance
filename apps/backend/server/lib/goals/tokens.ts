import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "~/db";
import { goalTokens } from "~/db/schema";
import type { DbUser } from "~/lib/auth/service";
import { NotAuthenticatedError, NotFoundError } from "~/lib/http/api-error";

const SECRET_BYTES = 32;
/** What an app's key is called on the wire, so it is never mistaken for an assistant key. */
export const GOAL_TOKEN_PREFIX = "balance_goals_";

/** What a key may do: read goals and streaks, post progress, make and change goals. */
export const GOAL_SCOPES = ["read", "progress", "manage"] as const;
export type GoalScope = (typeof GOAL_SCOPES)[number];

export interface GoalTokenSummary {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly scopes: GoalScope[];
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

function hash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

/** The keys apps post progress with. Hashed at rest; the secret exists once, in the answer to `issue`. */
class GoalTokenService {
  async issue(userId: string, input: { name: string; source: string; scopes: readonly GoalScope[] }) {
    const secret = `${GOAL_TOKEN_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`;
    const [created] = await db
      .insert(goalTokens)
      .values({ userId, name: input.name, source: input.source, scopes: [...input.scopes], tokenHash: hash(secret) })
      .returning();
    return { token: secret, key: summarize(created) };
  }

  async list(userId: string): Promise<GoalTokenSummary[]> {
    const rows = await db.query.goalTokens.findMany({
      where: eq(goalTokens.userId, userId),
      orderBy: desc(goalTokens.createdAt),
    });
    return rows.map(summarize);
  }

  async revoke(userId: string, id: string) {
    const [deleted] = await db
      .delete(goalTokens)
      .where(and(eq(goalTokens.id, id), eq(goalTokens.userId, userId)))
      .returning();
    if (!deleted) throw new NotFoundError("That key is already gone");
  }

  /** The account, the scopes and the source behind a key. */
  async resolve(secret: string): Promise<{ user: DbUser; scopes: GoalScope[]; source: string }> {
    const row = await db.query.goalTokens.findFirst({
      where: eq(goalTokens.tokenHash, hash(secret)),
      with: { user: true },
    });
    if (!row) throw new NotAuthenticatedError("That key is not valid");
    await db.update(goalTokens).set({ lastUsedAt: new Date() }).where(eq(goalTokens.id, row.id));
    return { user: row.user, scopes: row.scopes as GoalScope[], source: row.source };
  }
}

function summarize(row: typeof goalTokens.$inferSelect): GoalTokenSummary {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    scopes: row.scopes as GoalScope[],
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export const goalTokenService = new GoalTokenService();
