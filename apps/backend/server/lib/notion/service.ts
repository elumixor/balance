import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { type NotionMapping, type NotionTaskMapping, notionConnections, projects } from "~/db/schema";
import { decryptSecret, encryptSecret } from "~/lib/calendar/crypto";
import { ApiError, NotFoundError } from "~/lib/http/api-error";
import { NotionAuthError, NotionClient } from "./client";
import { type NotionGrant, notionOAuth } from "./oauth";
import { NotionSync, type SyncSummary } from "./sync";

/**
 * One granted workspace, as every picker and the settings list draw it. "The grant expired" is a
 * state with a row rather than an error — the same rule the calendar's grant is under, and for the
 * same reason: a 401 out of here would read as a dead session and bounce somebody to sign-in.
 */
export interface NotionConnectionStatus {
  readonly id: string;
  readonly workspaceName: string;
  readonly workspaceIcon: string | null;
  readonly accountName: string;
  readonly accountEmail: string;
  readonly needsReconnect: boolean;
  /** The data source projects are imported from, or empty while nobody has picked one. */
  readonly dataSourceId: string;
  /** The sphere imported projects land in. Empty until the import dialog has been through. */
  readonly categoryId: string;
  readonly mapping: NotionMapping;
  readonly lastSyncedAt: string | null;
  readonly lastError: string | null;
}

export interface NotionStatus {
  readonly connections: readonly NotionConnectionStatus[];
}

type ConnectionRow = typeof notionConnections.$inferSelect;

/** Renewed this long before it actually expires, so a sync never starts on a dying token. */
const REFRESH_MARGIN_MS = 60_000;
const EMPTY_SUMMARY: SyncSummary = { projects: 0, tasks: 0, people: 0 };

export class NotionService {
  constructor(private readonly userId: string) {}

  async status(): Promise<NotionStatus> {
    return { connections: (await this.#rows()).map(statusOf) };
  }

  /** The consent screen's URL. The app opens it in a real browser and waits for a row to change. */
  authUrl(state: string) {
    return notionOAuth.authUrl(state);
  }

  /** What the callback does with the code Notion sent back: one grant per workspace, encrypted. */
  async complete(code: string) {
    const grant = await notionOAuth.exchangeCode(code);
    await this.#write(grant);
    return grant;
  }

  /** The databases one workspace's grant can see, for the link and import dialogs. */
  async databases(connectionId: string) {
    return (await this.#client(await this.#row(connectionId))).databases();
  }

  /** A database's saved views — each a filter Notion runs, so one board can feed many projects. */
  async views(connectionId: string, dataSourceId: string) {
    return (await this.#client(await this.#row(connectionId))).views(dataSourceId);
  }

  /**
   * The answers the import dialog collects: which database holds projects, which sphere they land
   * in, and which column is the sentence under their names. Kept together because they are asked
   * together, and because a database chosen without them would import into nowhere.
   */
  async configure(connectionId: string, input: { dataSourceId: string; categoryId: string; mapping: NotionMapping }) {
    await this.#row(connectionId);
    await this.#stamp(connectionId, {
      projectsDataSourceId: input.dataSourceId,
      categoryId: input.categoryId,
      mapping: input.mapping,
      lastError: null,
    });
    return this.status();
  }

  /**
   * One project pointed at the database its tasks live in, with which column means what. The
   * tasks follow straight away, because a link nobody sees the result of is a link nobody trusts.
   */
  async link(
    projectId: string,
    target: { connectionId: string; dataSourceId: string; viewId: string | null; mapping: NotionTaskMapping },
  ) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, this.userId)),
    });
    if (!project) throw new NotFoundError("That project no longer exists.");

    const client = await this.#client(await this.#row(target.connectionId));
    const source = await client.dataSource(target.dataSourceId);
    const database = source.parent?.database_id ?? source.id;
    await db
      .update(projects)
      .set({
        notionConnectionId: target.connectionId,
        notionTasksDataSourceId: target.dataSourceId,
        notionViewId: target.viewId,
        notionTasksName: source.title?.map((run) => run.plain_text).join("") || "Tasks",
        notionTaskMapping: target.mapping,
        notionUrl: project.notionPageId ? project.notionUrl : `https://www.notion.so/${database.replaceAll("-", "")}`,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
    return this.sync();
  }

  /** The link goes; everything it brought in stays, because those rows are the app's records now. */
  async unlink(projectId: string) {
    await db
      .update(projects)
      .set({
        notionConnectionId: null,
        notionPageId: null,
        notionTasksDataSourceId: null,
        notionViewId: null,
        notionTasksName: null,
        notionTaskMapping: null,
        notionUrl: null,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.userId, this.userId)));
    return this.status();
  }

  /** One workspace's grant goes; what it mirrored stays, and its projects stop being synced. */
  async disconnect(connectionId: string) {
    await db
      .delete(notionConnections)
      .where(and(eq(notionConnections.id, connectionId), eq(notionConnections.userId, this.userId)));
    return this.status();
  }

  /**
   * A run over every workspace, and what they left behind. A refused grant is written down on its
   * own row rather than thrown: the other workspaces still sync, and the screen that asked shows
   * that one as needing a reconnect.
   */
  async sync(): Promise<{ status: NotionStatus; summary: SyncSummary | null }> {
    const rows = (await this.#rows()).filter((row) => !row.needsReconnect);
    if (rows.length === 0) return { status: await this.status(), summary: null };

    const summary = { ...EMPTY_SUMMARY };
    for (const row of rows) {
      const counts = await this.#syncOne(row);
      summary.projects += counts.projects;
      summary.tasks += counts.tasks;
      summary.people += counts.people;
    }
    return { status: await this.status(), summary };
  }

  async #syncOne(row: ConnectionRow): Promise<SyncSummary> {
    try {
      const client = await this.#client(row);
      const summary = await new NotionSync(this.userId, client, {
        connectionId: row.id,
        dataSourceId: row.projectsDataSourceId ?? null,
        categoryId: row.categoryId,
        mapping: row.mapping,
      }).run();
      await this.#stamp(row.id, { lastSyncedAt: new Date(), lastError: null, needsReconnect: false });
      return summary;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      await this.#stamp(row.id, { needsReconnect: error instanceof NotionAuthError, lastError: error.message });
      return EMPTY_SUMMARY;
    }
  }

  /** The client for one workspace's grant, renewed first when the token it holds is about to go. */
  async #client(row: ConnectionRow) {
    const stale = row.expiresAt !== null && row.expiresAt.getTime() - REFRESH_MARGIN_MS < Date.now();
    if (!stale) return new NotionClient(decryptSecret(row.token));

    if (!row.refreshToken) throw new NotionAuthError("That Notion connection has expired.");
    const grant = await notionOAuth.refresh(decryptSecret(row.refreshToken));
    await this.#write(grant);
    return new NotionClient(grant.accessToken);
  }

  /** A grant for a workspace already here replaces that row's; a new workspace is a new row. */
  #write(grant: NotionGrant) {
    const values = {
      token: encryptSecret(grant.accessToken),
      refreshToken: grant.refreshToken === null ? null : encryptSecret(grant.refreshToken),
      expiresAt: grant.expiresAt,
      workspaceName: grant.workspaceName,
      workspaceIcon: grant.workspaceIcon,
      // A renewal answers without the owner; the login that made the grant hasn't changed.
      ...(grant.accountEmail ? { accountName: grant.accountName, accountEmail: grant.accountEmail } : {}),
      needsReconnect: false,
      lastError: null,
      updatedAt: new Date(),
    };
    return db
      .insert(notionConnections)
      .values({ userId: this.userId, workspaceId: grant.workspaceId, ...values })
      .onConflictDoUpdate({ target: [notionConnections.userId, notionConnections.workspaceId], set: values });
  }

  #stamp(connectionId: string, values: Partial<typeof notionConnections.$inferInsert>) {
    return db
      .update(notionConnections)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(notionConnections.id, connectionId), eq(notionConnections.userId, this.userId)));
  }

  async #row(connectionId: string) {
    const row = await db.query.notionConnections.findFirst({
      where: and(eq(notionConnections.id, connectionId), eq(notionConnections.userId, this.userId)),
    });
    if (!row) throw new NotFoundError("That Notion workspace isn't connected any more.");
    return row;
  }

  #rows() {
    return db.query.notionConnections.findMany({
      where: eq(notionConnections.userId, this.userId),
      orderBy: (table, { asc }) => [asc(table.accountEmail), asc(table.createdAt)],
    });
  }
}

function statusOf(row: ConnectionRow): NotionConnectionStatus {
  return {
    id: row.id,
    workspaceName: row.workspaceName,
    workspaceIcon: row.workspaceIcon,
    accountName: row.accountName,
    accountEmail: row.accountEmail,
    needsReconnect: row.needsReconnect,
    dataSourceId: row.projectsDataSourceId ?? "",
    categoryId: row.categoryId ?? "",
    mapping: row.mapping,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}
