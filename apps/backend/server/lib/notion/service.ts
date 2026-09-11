import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { type NotionMapping, notionConnections, projects } from "~/db/schema";
import { decryptSecret, encryptSecret } from "~/lib/calendar/crypto";
import { ApiError, NotFoundError } from "~/lib/http/api-error";
import { NotionAuthError, NotionClient } from "./client";
import { type NotionGrant, notionOAuth } from "./oauth";
import { NotionSync, type SyncSummary } from "./sync";

/**
 * What the settings row draws. "Not connected", "nothing chosen yet" and "the grant expired" are
 * states with a row each rather than errors — the same rule the calendar's grant is under, and for
 * the same reason: a 401 out of here would read as a dead session and bounce somebody to sign-in.
 */
export interface NotionStatus {
  readonly connected: boolean;
  readonly needsReconnect: boolean;
  readonly workspaceName: string;
  /** The data source projects are read from, or empty while nobody has picked one. */
  readonly dataSourceId: string;
  /** The sphere mirrored projects land in. Empty until the setup dialog has been through. */
  readonly categoryId: string;
  readonly mapping: NotionMapping;
  readonly lastSyncedAt: string | null;
  readonly lastError: string | null;
}

const DISCONNECTED: NotionStatus = {
  connected: false,
  needsReconnect: false,
  workspaceName: "",
  dataSourceId: "",
  categoryId: "",
  mapping: { description: null, fields: [] },
  lastSyncedAt: null,
  lastError: null,
};

/** Renewed this long before it actually expires, so a sync never starts on a dying token. */
const REFRESH_MARGIN_MS = 60_000;

export class NotionService {
  constructor(private readonly userId: string) {}

  async status(): Promise<NotionStatus> {
    const row = await this.#row();
    if (!row) return DISCONNECTED;
    return {
      connected: true,
      needsReconnect: row.needsReconnect,
      workspaceName: row.workspaceName,
      dataSourceId: row.projectsDataSourceId ?? "",
      categoryId: row.categoryId ?? "",
      mapping: row.mapping,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastError: row.lastError,
    };
  }

  /** The consent screen's URL. The app opens it in a real browser and waits for the row to change. */
  authUrl(state: string) {
    return notionOAuth.authUrl(state);
  }

  /** What the callback does with the code Notion sent back: one grant, kept encrypted. */
  async complete(code: string) {
    const grant = await notionOAuth.exchangeCode(code);
    await this.#write(grant);
    return this.status();
  }

  /** The databases this grant can see, for the one question left after connecting. */
  async dataSources() {
    return (await this.#client()).databases();
  }

  /**
   * The answers the setup dialog collects: which database, which sphere its projects land in, and
   * what the columns beside their names mean. Kept together because they are asked together, and
   * because a database chosen without them would sync into nowhere.
   */
  async configure(input: { dataSourceId: string; categoryId: string; mapping: NotionMapping }) {
    await this.#stamp({
      projectsDataSourceId: input.dataSourceId,
      categoryId: input.categoryId,
      mapping: input.mapping,
      lastError: null,
    });
    return this.status();
  }

  /** What somebody could point a project at — pages and databases by name. */
  async search(query: string) {
    return (await this.#client()).search(query);
  }

  /**
   * One project pointed at Notion by hand: the page it is written on, or the database its tasks
   * live in when somebody picks that directly. The tasks follow on the next run — from the
   * database under that page, found the same way a mirrored project's is.
   */
  async link(projectId: string, target: { id: string; kind: "page" | "database" }) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, this.userId)),
    });
    if (!project) throw new NotFoundError("That project no longer exists.");

    const client = await this.#client();
    const page = target.kind === "page" ? await client.page(target.id) : null;
    await db
      .update(projects)
      .set({
        notionPageId: target.kind === "page" ? target.id : null,
        notionTasksDataSourceId: target.kind === "database" ? target.id : null,
        notionUrl: page?.url ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
    return this.sync();
  }

  /** The link goes; everything it brought in stays, because those rows are the app's records now. */
  async unlink(projectId: string) {
    await db
      .update(projects)
      .set({ notionPageId: null, notionTasksDataSourceId: null, notionUrl: null, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.userId, this.userId)));
    return this.status();
  }

  async disconnect(): Promise<NotionStatus> {
    await db.delete(notionConnections).where(eq(notionConnections.userId, this.userId));
    return DISCONNECTED;
  }

  /**
   * A run, and what it left behind. A refused grant is written down rather than thrown: the screen
   * that asked shows the row it already has, now saying it needs reconnecting.
   */
  async sync(): Promise<{ status: NotionStatus; summary: SyncSummary | null }> {
    const row = await this.#row();
    if (!row) return { status: DISCONNECTED, summary: null };

    try {
      const client = await this.#client();
      const summary = await new NotionSync(this.userId, client, {
        dataSourceId: row.projectsDataSourceId ?? null,
        categoryId: row.categoryId,
        mapping: row.mapping,
      }).run();
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

  /** The client for this account's grant, renewed first when the token it holds is about to go. */
  async #client() {
    const row = await this.#row();
    if (!row) throw new ApiError("Connect a Notion workspace first.");
    const stale = row.expiresAt !== null && row.expiresAt.getTime() - REFRESH_MARGIN_MS < Date.now();
    if (!stale) return new NotionClient(decryptSecret(row.token));

    if (!row.refreshToken) throw new NotionAuthError("That Notion connection has expired.");
    const grant = await notionOAuth.refresh(decryptSecret(row.refreshToken));
    await this.#write(grant);
    return new NotionClient(grant.accessToken);
  }

  #write(grant: NotionGrant) {
    const values = {
      token: encryptSecret(grant.accessToken),
      refreshToken: grant.refreshToken === null ? null : encryptSecret(grant.refreshToken),
      expiresAt: grant.expiresAt,
      workspaceId: grant.workspaceId,
      workspaceName: grant.workspaceName,
      needsReconnect: false,
      lastError: null,
      updatedAt: new Date(),
    };
    return db
      .insert(notionConnections)
      .values({ userId: this.userId, ...values })
      .onConflictDoUpdate({ target: notionConnections.userId, set: values });
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
