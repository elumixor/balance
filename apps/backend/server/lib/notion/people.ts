import type { NotionClient, NotionPage, NotionPerson } from "./client";
import { assigneeKeys, runsOf } from "./map";

/** One person a task board can be narrowed to, and whether it is the account's own Notion login. */
export interface Assignable {
  readonly id: string;
  readonly name: string;
  readonly me: boolean;
}

/**
 * Who an assignee property can name, so a project can keep only some people's tasks. A people or
 * created-by property names workspace members; a relation names the pages of a people database;
 * a select, or a formula that spells names out, names whoever its rows mention. Either way the
 * grant's own login is marked, so "only mine" is one press — by name where all there is is a name.
 */
export async function assignablePeople(client: NotionClient, dataSourceId: string, propertyId: string) {
  const [schema, owner] = await Promise.all([client.dataSource(dataSourceId), client.owner()]);
  const entry = Object.entries(schema.properties).find(([, one]) => one.id === propertyId);
  if (!entry) return [];
  const [name, property] = entry;

  const people = await candidates(client, dataSourceId, name, property);
  return people
    .filter((one) => one.name)
    .map((one) => ({ ...one, me: isOwner(one, owner) }))
    .toSorted((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name));
}

async function candidates(
  client: NotionClient,
  dataSourceId: string,
  name: string,
  property: { type: string; relation?: { data_source_id?: string } },
): Promise<{ id: string; name: string }[]> {
  if (property.type === "people" || property.type === "created_by")
    return (await client.people()).map((user) => ({ id: user.id, name: user.name ?? "" }));
  if (property.type === "relation") {
    const target = property.relation?.data_source_id;
    if (!target) return [];
    const pages = await client.queryDataSource(target);
    return Promise.all(pages.map(async (page) => ({ id: page.id, name: await client.text(titleRuns(page)) })));
  }
  const mentioned = new Set(
    (await client.queryDataSource(dataSourceId)).flatMap((page) =>
      assigneeKeys(page.properties[name] as Record<string, unknown> | undefined),
    ),
  );
  return [...mentioned].map((one) => ({ id: one, name: one }));
}

function titleRuns(page: NotionPage) {
  return runsOf(
    Object.values(page.properties).find((one) => (one as { type?: string }).type === "title") as
      | Record<string, unknown>
      | undefined,
  );
}

function isOwner(candidate: { id: string; name: string }, owner: NotionPerson | null) {
  if (!owner) return false;
  if (candidate.id === owner.id) return true;
  return Boolean(owner.name) && candidate.name.trim().toLowerCase() === owner.name?.trim().toLowerCase();
}
