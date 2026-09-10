import { eq } from "drizzle-orm";
import { db } from "~/db";
import { notionConnections } from "~/db/schema";
import { decryptSecret, encryptSecret } from "~/lib/calendar/crypto";
import { ApiError } from "~/lib/http/api-error";
import { NotionAuthError, NotionClient } from "./client";
import { databaseIdOf } from "./map";
import { NotionSync, type SyncSummary } from "./sync";

/**
 * What the settings screen draws. "Not connected" and "the token stopped working" are states with
 * a row each rather than errors — the same rule the calendar's grant is under, and for the same
 * reason: a 401 out of here would read as a dead session and bounce somebody to sign-in.
 */
export interface NotionStatus {
  readonly connected: boolean;
  readonly needsReconnect: boolean;
  readonly workspaceName: string;
  readonly databaseId: string;
  readonly lastSyncedAt: string | null;
  readonly lastError: string | null;
}

const DISCONNECTED: NotionStatus = {
  connected: false,
  needsReconnect: false,
  workspaceName: "",
  databaseId: "",
  lastSyncedAt: null,
  lastError: null,
};

export class NotionService {
  constructor(private readonly userId: string) {}

  async status(): Promise<NotionStatus> {
    const row = await this.#row();
    if (!row) return DISCONNECTED;
    return {
      connected: true,
      needsReconnect: row.needsReconnect,
      workspaceName: row.workspaceName,
      databaseId: row.projectsDatabaseId,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastError: row.lastError,
    };
  }

  /**
   * The token and the database are checked together before either is stored: a grant that can't
   * open the database it names is not a connection, and saying so now is the difference between
   * a sentence on the settings screen and a sync that fails nightly for a fortnight.
   */
  async connect(token: string, database: string): Promise<NotionStatus> {
    const projectsDatabaseId = databaseIdOf(database);
    if (!projectsDatabaseId) throw new ApiError("That doesn't look like a Notion database link.");

    const answer = await new NotionClient(token).database(projectsDatabaseId);
    const workspaceName = answer.title.map((run) => run.plain_text).join("") || "Notion";
    const values = {
      token: encryptSecret(token),
      projectsDatabaseId,
      workspaceName,
      needsReconnect: false,
      lastError: null,
      updatedAt: new Date(),
    };
    await db
      .insert(notionConnections)
      .values({ userId: this.userId, ...values })
      .onConflictDoUpdate({ target: notionConnections.userId, set: values });
    return this.status();
  }

  async disconnect(): Promise<NotionStatus> {
    await db.delete(notionConnections).where(eq(notionConnections.userId, this.userId));
    return DISCONNECTED;
  }

  /**
   * A run, and what it left behind. A refused token is written down rather than thrown: the screen
   * that asked shows the row it already has, now saying it needs reconnecting.
   */
  async sync(): Promise<{ status: NotionStatus; summary: SyncSummary | null }> {
    const row = await this.#row();
    if (!row) return { status: DISCONNECTED, summary: null };

    const client = new NotionClient(decryptSecret(row.token));
    try {
      const summary = await new NotionSync(this.userId, client, row.projectsDatabaseId).run();
      await this.#stamp({ lastSyncedAt: new Date(), lastError: null, needsReconnect: false });
      return { status: await this.status(), summary };
    } catch (error) {
      const needsReconnect = error instanceof NotionAuthError;
      const lastError = error instanceof ApiError ? error.message : "Notion couldn't be read just now.";
      await this.#stamp({ needsReconnect, lastError });
      if (!(error instanceof ApiError)) throw error;
      return { status: await this.status(), summary: null };
    }
  }

  #stamp(values: Partial<typeof notionConnections.$inferInsert>) {
    return db
      .update(notionConnections)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(notionConnections.userId, this.userId));
  }

  #row() {
    return db.query.notionConnections.findFirst({ where: eq(notionConnections.userId, this.userId) });
  }
}
