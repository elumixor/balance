import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db } from "~/db";
import { type NotionTaskMapping, people, projects, type TaskStatus, tasks } from "~/db/schema";
import { colorFor } from "~/lib/people/color";
import type { NotionClient, NotionPage } from "./client";
import { resolveTaskFields, type TaskFields } from "./data-source";
import { keepAssigned } from "./filter";
import { dateOf, priorityOf, relationIds, runsOf, selectName, taskStatus } from "./map";

/** One entry of a people property, as Notion sends it. */
interface NotionUser {
  readonly id: string;
  readonly name?: string;
  readonly person?: { email?: string };
}

/** Where one project's tasks are read from: a board, how its columns read, and which view. */
export interface TaskSource {
  readonly dataSourceId: string;
  readonly mapping: NotionTaskMapping | null;
  readonly viewId: string | null;
  /** Whose tasks to keep; empty keeps every row the view or board holds. */
  readonly assignees: readonly string[];
}

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
   * can feed a project per view — and the people chosen narrow it further. A row that leaves
   * either is archived here like a deleted one.
   */
  async run(projectId: string, source: TaskSource) {
    const schema = await this.client.dataSource(source.dataSourceId);
    const fields = resolveTaskFields(schema, source.mapping);
    // The board's name follows Notion's, mentions said by name, so the project's chip stays right.
    const name = await this.client.text(schema.title);
    if (name)
      await db
        .update(projects)
        .set({ notionTasksName: name, updatedAt: new Date() })
        .where(
          and(eq(projects.id, projectId), or(isNull(projects.notionTasksName), ne(projects.notionTasksName, name))),
        );
    await this.#push(projectId, source.dataSourceId, fields);
    const pages = source.viewId
      ? await this.client.queryView(source.viewId)
      : await this.client.queryDataSource(source.dataSourceId);
    return this.#pull(projectId, keepAssigned(pages, fields, source.assignees), fields);
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
    const assignees = await this.#assignees(property(page, fields.assignee));
    const mirrored = {
      title: (await this.client.text(runsOf(property(page, fields.title)))) || "Untitled",
      description: await this.client.text(runsOf(property(page, "Description"))),
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

  /**
   * Whose a task is, as this account's people. A people or created-by property already carries
   * each name and address; a relation names pages of a people database, read for their titles. A
   * property that only spells names out says nothing a person can be made from.
   */
  async #assignees(value: Record<string, unknown> | undefined) {
    const ids: string[] = [];
    if (value?.type === "people" || value?.type === "created_by") {
      const users = (value.type === "people" ? value.people : [value.created_by]) as NotionUser[] | undefined;
      for (const user of users ?? [])
        ids.push(
          await this.#person(user.id, async () => ({ name: user.name ?? "", email: user.person?.email ?? null })),
        );
      return ids;
    }
    if (value?.type !== "relation") return ids;
    for (const notionId of relationIds(value)) ids.push(await this.#person(notionId, () => this.#pageName(notionId)));
    return ids;
  }

  async #pageName(notionPageId: string) {
    const page = await this.client.page(notionPageId);
    const title = Object.values(page.properties).find((one) => (one as { type?: string }).type === "title");
    return { name: await this.client.text(runsOf(title as Record<string, unknown> | undefined)), email: null };
  }

  /**
   * A Notion person, asked about once and then remembered as a person of this account — the one
   * already known by that address when there is one, so a colleague met in the calendar and
   * assigned in Notion is one face.
   */
  async #person(notionId: string, describe: () => Promise<{ name: string; email: string | null }>) {
    await this.#loadPeople();
    const known = this.#people.get(notionId);
    if (known) return known;

    const { name, email } = await describe();
    const byEmail = email
      ? await db.query.people.findFirst({ where: and(eq(people.userId, this.userId), eq(people.email, email)) })
      : undefined;
    if (byEmail) {
      await db.update(people).set({ notionPageId: notionId }).where(eq(people.id, byEmail.id));
      this.#people.set(notionId, byEmail.id);
      return byEmail.id;
    }
    const [row] = await db
      .insert(people)
      .values({
        userId: this.userId,
        name: name || "Someone",
        email,
        color: colorFor(notionId),
        notionPageId: notionId,
      })
      .returning();
    if (!row) throw new Error("A person was written and could not be read back");
    this.#people.set(notionId, row.id);
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
