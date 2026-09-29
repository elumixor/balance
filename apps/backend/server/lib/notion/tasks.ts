import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "~/db";
import { type NotionTaskMapping, people, type TaskStatus, tasks } from "~/db/schema";

/** Where one project's tasks are read from: a board, how its columns read, and which view. */
export interface TaskSource {
  readonly dataSourceId: string;
  readonly mapping: NotionTaskMapping | null;
  readonly viewId: string | null;
}

import { colorFor } from "~/lib/people/color";
import type { NotionClient, NotionPage } from "./client";
import { resolveTaskFields, type TaskFields } from "./data-source";
import { dateOf, plainText, priorityOf, relationIds, selectName, taskStatus } from "./map";

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

  /**
   * A view, when one is chosen, decides which rows are this project's — one board of every task
   * can feed a project per view — and a row that leaves the view is archived here like a deleted one.
   */
  async run(projectId: string, source: TaskSource) {
    const fields = resolveTaskFields(await this.client.dataSource(source.dataSourceId), source.mapping);
    await this.#push(projectId, source.dataSourceId, fields);
    const pages = source.viewId
      ? await this.client.queryView(source.viewId)
      : await this.client.queryDataSource(source.dataSourceId);
    return this.#pull(projectId, pages, fields);
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

  async #pull(projectId: string, all: readonly NotionPage[], fields: TaskFields) {
    const pages = all.filter((page) => !page.in_trash && !page.archived);
    for (const page of pages) await this.#write(projectId, page, fields);
    await this.#writeParents(projectId, pages, fields);
    await this.#archiveMissing(projectId, pages);
    return pages.length;
  }

  async #write(projectId: string, page: NotionPage, fields: TaskFields) {
    const label = labelOf(property(page, fields.status), fields);
    const { startsOn, endsOn } = dateOf(property(page, fields.dates));
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
  return {
    [fields.title]: { title: [{ text: { content: row.title } }] },
    ...(fields.status ? statusValue(row.status, fields.status, fields) : {}),
    ...(fields.dates && row.startsOn
      ? { [fields.dates]: { date: { start: row.startsOn, end: row.endsOn === row.startsOn ? null : row.endsOn } } }
      : {}),
  };
}

/** A checkbox reads as the two words the app's status helpers already know. */
const CHECKED = "Done";

function labelOf(value: Record<string, unknown> | undefined, fields: TaskFields) {
  if (fields.statusType === "checkbox") return value?.checkbox ? CHECKED : "";
  return selectName(value);
}

/**
 * The status as the board writes it: a tick for a checkbox, otherwise the board's own column for
 * where the task is — and nothing when the board has no column meaning it.
 */
function statusValue(status: TaskStatus, name: string, fields: TaskFields) {
  if (fields.statusType === "checkbox") return { [name]: { checkbox: status === "done" } };
  const column = fields.columns[status];
  if (!column || !fields.statusType) return {};
  return { [name]: { [fields.statusType]: { name: column } } };
}
