import type { MutationLog } from "@elumixor/synced/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { syncMutations } from "../../db/schema";

/**
 * Which writes this server has already carried out, kept in the database rather than in memory:
 * the process that took the write is rarely the one the retry reaches.
 */
export class DbMutationLog implements MutationLog {
  async seen(userId: string, mutationIds: readonly string[]) {
    if (mutationIds.length === 0) return new Set<string>();
    const rows = await db
      .select({ mutationId: syncMutations.mutationId })
      .from(syncMutations)
      .where(and(eq(syncMutations.userId, userId), inArray(syncMutations.mutationId, [...mutationIds])));
    return new Set(rows.map((row) => row.mutationId));
  }

  async remember(userId: string, mutationIds: readonly string[]) {
    if (mutationIds.length === 0) return;
    await db
      .insert(syncMutations)
      .values(mutationIds.map((mutationId) => ({ userId, mutationId })))
      .onConflictDoNothing();
  }
}
