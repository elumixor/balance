import { ApiError, UpstreamError } from "~/lib/http/api-error";

const API = "https://api.notion.com/v1";
/** The version this client is written against — data sources, and pages that belong to them. */
const VERSION = "2026-03-11";
const PAGE_SIZE = 100;

export interface NotionPage {
  readonly id: string;
  readonly url: string;
  readonly last_edited_time: string;
  readonly in_trash?: boolean;
  readonly archived?: boolean;
  readonly icon?: { type: string; emoji?: string } | null;
  readonly properties: Record<string, unknown>;
}

export interface NotionDataSourceSchema {
  readonly id: string;
  readonly properties: Record<string, { type: string; status?: { groups: NotionStatusGroup[] } }>;
}

export interface NotionStatusGroup {
  readonly name: string;
  readonly option_ids: string[];
}

interface Paged<T> {
  readonly results: T[];
  readonly has_more: boolean;
  readonly next_cursor: string | null;
}

interface NotionBlock {
  readonly id: string;
  readonly type: string;
  readonly has_children: boolean;
  readonly child_database?: { title: string };
  readonly child_page?: { title: string };
}

/**
 * A token Notion has stopped accepting. Never a 401 on the way out: the app reads that one status
 * as a dead Clerk session and bounces to sign-in, and a stale Notion grant is a row on a settings
 * screen instead.
 */
export class NotionAuthError extends ApiError {
  constructor(message: string) {
    super(message, 409);
    this.name = "NotionAuthError";
  }
}

/**
 * Everything this app asks Notion for, in one place.
 *
 * The official SDK is not used for the same reason the MCP server writes its own JSON-RPC: it
 * carries a transport and a validator of its own, and what is needed here is eight requests.
 */
export class NotionClient {
  constructor(private readonly token: string) {}

  async database(databaseId: string) {
    return this.#request<{ title: { plain_text: string }[]; data_sources: { id: string; name: string }[] }>(
      `/databases/${databaseId}`,
    );
  }

  async dataSource(dataSourceId: string) {
    return this.#request<NotionDataSourceSchema>(`/data_sources/${dataSourceId}`);
  }

  /** Every page of a data source, followed to the end — a project's tasks are hundreds, not tens. */
  async queryDataSource(dataSourceId: string) {
    const pages: NotionPage[] = [];
    let cursor: string | null = null;
    do {
      const page: Paged<NotionPage> = await this.#request<Paged<NotionPage>>(
        `/data_sources/${dataSourceId}/query`,
        "POST",
        { page_size: PAGE_SIZE, ...(cursor ? { start_cursor: cursor } : {}) },
      );
      pages.push(...page.results);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return pages;
  }

  async page(pageId: string) {
    return this.#request<NotionPage>(`/pages/${pageId}`);
  }

  async updatePage(pageId: string, properties: Record<string, unknown>) {
    return this.#request<NotionPage>(`/pages/${pageId}`, "PATCH", { properties });
  }

  async createPage(dataSourceId: string, properties: Record<string, unknown>) {
    return this.#request<NotionPage>("/pages", "POST", {
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
    });
  }

  /**
   * Every database this grant can see, with its columns — the whole of what the setup dialog has
   * to ask about, in one request rather than one per database somebody might pick.
   */
  async databases() {
    const answer = await this.#request<{
      results: { id: string; title?: { plain_text: string }[]; properties?: Record<string, { type: string }> }[];
    }>("/search", "POST", { filter: { property: "object", value: "data_source" }, page_size: 100 });
    return answer.results.map((result) => ({
      id: result.id,
      name: result.title?.map((run) => run.plain_text).join("") || "Untitled",
      properties: Object.entries(result.properties ?? {}).map(([name, property]) => ({ name, type: property.type })),
    }));
  }

  /**
   * Pages and databases by name, for linking one project by hand. Both kinds come back together
   * because somebody linking a project is pointing at "Hypocrisy" without caring which it is.
   */
  async search(query: string) {
    const answer = await this.#request<{
      results: {
        id: string;
        object: string;
        url?: string;
        title?: { plain_text: string }[];
        properties?: Record<string, unknown>;
      }[];
    }>("/search", "POST", { ...(query ? { query } : {}), page_size: 25 });
    return answer.results.map((result) => ({
      id: result.id,
      kind: result.object === "page" ? ("page" as const) : ("database" as const),
      name: titleOf(result) || "Untitled",
      url: result.url ?? null,
    }));
  }

  async children(blockId: string) {
    const blocks: NotionBlock[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?page_size=${PAGE_SIZE}&start_cursor=${cursor}` : `?page_size=${PAGE_SIZE}`;
      const page: Paged<NotionBlock> = await this.#request<Paged<NotionBlock>>(`/blocks/${blockId}/children${query}`);
      blocks.push(...page.results);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return blocks;
  }

  async #request<T>(path: string, method: "GET" | "POST" | "PATCH" = "GET", body?: unknown): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        "notion-version": VERSION,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.ok) return (await response.json()) as T;

    const detail = await response.text();
    if (response.status === 401 || response.status === 403)
      throw new NotionAuthError("Notion refused the token — reconnect the workspace.");
    throw new UpstreamError(`Notion answered ${response.status}: ${detail.slice(0, 200)}`);
  }
}

/** A search result's name, wherever that result keeps it — a database's own title, a page's. */
function titleOf(result: { title?: { plain_text: string }[]; properties?: Record<string, unknown> }) {
  if (result.title) return result.title.map((run) => run.plain_text).join("");
  const property = Object.values(result.properties ?? {}).find(
    (value) => (value as { type?: string }).type === "title",
  ) as { title?: { plain_text: string }[] } | undefined;
  return property?.title?.map((run) => run.plain_text).join("") ?? "";
}
