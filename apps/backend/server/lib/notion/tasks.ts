import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "~/db";
import { people, type TaskStatus, tasks } from "~/db/schema";
import type { NotionClient, NotionPage } from "./client";
import { resolveTaskFields, type TaskFields } from "./data-source";
import { dateOf, plainText, priorityOf, relationIds, selectName, taskStatus } from "./map";

/** Avatar colours, picked by the person's own id so the same face is the same colour everywhere. */
const COLORS = ["#e8b931", "#4f9dde", "#7bc86c", "#d97ec4", "#e0725b", "#8f7bd8"];
/** A row edited within a second of what Notion reported is the sync's own write coming back. */
const SKEW_MS = 1000;

/**
 * One project's tasks, both ways. The app's writes go up first — status, dates, the title and who
 * it is for — and everything else is taken from Notion, including which tasks there are at all: a
 * page nobody can find any more is archived here rather than kept as a bar nothing will move.
 */
export class TaskSync {
  #people = new Map<string, string>();
  #loaded = false;
  peopleSeen = 0;

  constructor(
    private readonly userId: string,
    private readonly client: NotionClient,
  ) {}

  async run(projectId: string, dataSourceId: string) {
    const fields = resolveTaskFields(await this.client.dataSource(dataSourceId));
    await this.#push(projectId, dataSourceId, fields);
    return this.#pull(projectId, dataSourceId, fields);
  }

  async #push(projectId: string, dataSourceId: string, fields: TaskFields) {
    const rows = await db.query.tasks.findMany({
      where: and(eq(tasks.userId, this.userId), eq(tasks.projectId, projectId), eq(tasks.archived, false)),
    });
    for (const row of rows) {
      const ahead = !row.notionEditedAt || row.updatedAt.getTime() > row.notionEditedAt.getTime() + SKEW_MS;
      if (!ahead) continue;
      const properties = propertiesOf(row, fields);
      const page = row.notionPageId
        ? await this.client.updatePage(row.notionPageId, properties)
        : await this.client.createPage(dataSourceId, properties);
      await db
        .update(tasks)
        .set({ notionPageId: page.id, notionUrl: page.url, notionEditedAt: new Date(page.last_edited_time) })
        .where(eq(tasks.id, row.id));
    }
  }

  async #pull(projectId: string, dataSourceId: string, fields: TaskFields) {
    const pages = (await this.client.queryDataSource(dataSourceId)).filter((page) => !page.in_trash && !page.archived);
    for (const page of pages) await this.#write(projectId, page, fields);
    await this.#writeParents(projectId, pages, fields);
    await this.#archiveMissing(projectId, pages);
    return pages.length;
  }

  async #write(projectId: string, page: NotionPage, fields: TaskFields) {
    const label = selectName(property(page, fields.status));
    const { startsOn, endsOn } = dateOf(property(page, fields.date));
    const assignees = await this.#assignees(relationIds(property(page, fields.assignee)));
    const mirrored = {
      title: plainText(property(page, fields.title)) || "Untitled",
      description: plainText(property(page, "Description")),
      status: taskStatus(label, fields.groups[label] ?? null),
      statusLabel: label,
      priority: priorityOf(selectName(property(page, fields.priority))),
      startsOn,
      endsOn,
      assigneeIds: assignees,
      notionUrl: page.url,
      notionEditedAt: new Date(page.last_edited_time),
      archived: false,
      updatedAt: new Date(),
    };
    const existing = await this.#byNotionId(page.id);
    if (existing) await db.update(tasks).set(mirrored).where(eq(tasks.id, existing.id));
    else await db.insert(tasks).values({ userId: this.userId, projectId, notionPageId: page.id, ...mirrored });
  }

  /** Nesting, once every page has a row: a subtask can be read before the task it hangs under. */
  async #writeParents(projectId: string, pages: readonly NotionPage[], fields: TaskFields) {
    const rows = await this.#mirrored(projectId);
    const byNotionId = new Map(rows.map((row) => [row.notionPageId, row.id]));
    for (const page of pages) {
      const id = byNotionId.get(page.id);
      const parent = relationIds(property(page, fields.parent))[0];
      if (!id) continue;
      await db
        .update(tasks)
        .set({ parentId: (parent ? byNotionId.get(parent) : null) ?? null, updatedAt: new Date() })
        .where(eq(tasks.id, id));
    }
  }

  async #archiveMissing(projectId: string, pages: readonly NotionPage[]) {
    const alive = new Set(pages.map((page) => page.id));
    for (const row of await this.#mirrored(projectId)) {
      if (row.notionPageId && !alive.has(row.notionPageId))
        await db.update(tasks).set({ archived: true, updatedAt: new Date() }).where(eq(tasks.id, row.id));
    }
  }

  async #assignees(notionIds: readonly string[]) {
    const ids: string[] = [];
    for (const notionId of notionIds) ids.push(await this.#person(notionId));
    return ids;
  }

  /** A name for a relation id, asked for once and then remembered as a person of this account. */
  async #person(notionPageId: string) {
    await this.#loadPeople();
    const known = this.#people.get(notionPageId);
    if (known) return known;

    const page = await this.client.page(notionPageId);
    const title = Object.values(page.properties).find((value) => (value as { type?: string }).type === "title");
    const name = plainText(title as Record<string, unknown>) || "Someone";
    const [row] = await db
      .insert(people)
      .values({ userId: this.userId, name, color: colorFor(notionPageId), notionPageId })
      .returning();
    if (!row) throw new Error("A person was written and could not be read back");
    this.#people.set(notionPageId, row.id);
    this.peopleSeen += 1;
    return row.id;
  }

  async #loadPeople() {
    if (this.#loaded) return;
    const rows = await db.query.people.findMany({
      where: and(eq(people.userId, this.userId), isNotNull(people.notionPageId)),
    });
    for (const row of rows) if (row.notionPageId) this.#people.set(row.notionPageId, row.id);
    this.#loaded = true;
  }

  #mirrored(projectId: string) {
    return db.query.tasks.findMany({
      where: and(eq(tasks.userId, this.userId), eq(tasks.projectId, projectId), isNotNull(tasks.notionPageId)),
    });
  }

  #byNotionId(notionPageId: string) {
    return db.query.tasks.findFirst({
      where: and(eq(tasks.userId, this.userId), eq(tasks.notionPageId, notionPageId)),
    });
  }
}

function property(page: NotionPage, name: string | null) {
  return name ? (page.properties[name] as Record<string, unknown> | undefined) : undefined;
}

/** What a write to Notion carries: the app's three fields, and only where the board has them. */
function propertiesOf(row: typeof tasks.$inferSelect, fields: TaskFields) {
  const column = columnFor(row.status, fields);
  return {
    [fields.title]: { title: [{ text: { content: row.title } }] },
    ...(fields.status && column ? { [fields.status]: { status: { name: column } } } : {}),
    ...(fields.date && row.startsOn
      ? { [fields.date]: { date: { start: row.startsOn, end: row.endsOn === row.startsOn ? null : row.endsOn } } }
      : {}),
  };
}

/** The board's own word for where the task is — its stored label when that column still exists. */
function columnFor(status: TaskStatus, fields: TaskFields) {
  return fields.columns[status] ?? null;
}

function colorFor(key: string) {
  const sum = [...key].reduce((total, char) => total + char.charCodeAt(0), 0);
  return COLORS[sum % COLORS.length] as string;
}
