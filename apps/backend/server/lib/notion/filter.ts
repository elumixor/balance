import type { NotionPage } from "./client";
import { assigneeKeys, relationIds } from "./map";

/** Which properties of a page say whose it is and what it sits under, by their current names. */
export interface FilterFields {
  readonly assignee: string | null;
  readonly parent: string | null;
}

/**
 * The rows assigned to any of the given people — by id, or by name where the property only has
 * names — and every task they sit under — a subtask kept
 * without its parent would be work nobody can find on the timeline. No people, or no assignee
 * property to read them from, keeps every row.
 */
export function keepAssigned(pages: readonly NotionPage[], fields: FilterFields, people: readonly string[]) {
  if (people.length === 0 || !fields.assignee) return [...pages];
  const wanted = new Set(people);
  const byId = new Map(pages.map((page) => [page.id, page]));
  const kept = new Set<string>();

  for (const page of pages) {
    if (!assigneeKeys(value(page, fields.assignee)).some((key) => wanted.has(key))) continue;
    let current: NotionPage | undefined = page;
    while (current && !kept.has(current.id)) {
      kept.add(current.id);
      const parent: string | undefined = fields.parent ? relationIds(value(current, fields.parent))[0] : undefined;
      current = parent ? byId.get(parent) : undefined;
    }
  }
  return pages.filter((page) => kept.has(page.id));
}

function value(page: NotionPage, name: string) {
  return page.properties[name] as Record<string, unknown> | undefined;
}
