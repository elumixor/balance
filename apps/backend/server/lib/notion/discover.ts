import type { NotionClient } from "./client";

const TASKS = /task/i;
/** How far under a project page to look. Their tasks live under a "Plan" page, one level down. */
const MAX_DEPTH = 3;
/** A page with hundreds of blocks is a document, not a folder — stop rather than walk it all. */
const MAX_VISITED = 60;

/**
 * The database holding a project's tasks, found by walking down from the project's own page.
 *
 * Notion says nothing about which of a page's databases is the one with the work in it, so the
 * name is the only signal there is — and the walk stops at the first one that answers to it.
 */
export async function findTasksDataSource(client: NotionClient, pageId: string): Promise<string | null> {
  let frontier = [pageId];
  let visited = 0;
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && visited < MAX_VISITED; depth++) {
    const next: string[] = [];
    for (const blockId of frontier) {
      const blocks = await client.children(blockId);
      visited += blocks.length;
      const database = blocks.find(
        (block) => block.type === "child_database" && TASKS.test(block.child_database?.title ?? ""),
      );
      if (database) {
        const [source] = (await client.database(database.id)).data_sources;
        if (source) return source.id;
      }
      next.push(
        ...blocks.filter((block) => block.type === "child_page" && block.has_children).map((block) => block.id),
      );
    }
    frontier = next;
  }
  return null;
}
