import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "~/db";
import { categories, type NotionMapping, projects } from "~/db/schema";
import { ApiError } from "~/lib/http/api-error";
import type { NotionClient, NotionPage } from "./client";
import { findTasksDataSource } from "./discover";
import { plainText, relationIds } from "./map";
import { TaskSync } from "./tasks";

export interface SyncSummary {
  readonly projects: number;
  readonly tasks: number;
  readonly people: number;
}

const PARENT_NAMES = ["parent project", "parent item", "parent"];

/**
 * One run of the mirror over one workspace: its projects database and, for each project linked
 * through it, the database its tasks live in.
 *
 * Which half wins is a rule rather than a negotiation. **Notion owns everything it is shown** —
 * a project's name, its description, which tasks exist and what they are called — because that
 * is where the work is actually written. The app owns the three things a person changes while
 * doing the work rather than while planning it: a task's status, its dates and who it is for.
 * Those go up first, so a pull can never overwrite a tap made a second ago.
 */
export class NotionSync {
  #counts = { projects: 0, tasks: 0, people: 0 };

  constructor(
    private readonly userId: string,
    private readonly client: NotionClient,
    private readonly config: {
      connectionId: string;
      dataSourceId: string | null;
      categoryId: string | null;
      mapping: NotionMapping;
    },
  ) {}

  /**
   * Two ways in, and a run does both. A projects database chosen in the import dialog brings its
   * rows in as projects; a project linked to a task database is one somebody made here and
   * pointed at Notion afterwards. Either way what follows is the same: every linked project's tasks.
   */
  async run(): Promise<SyncSummary> {
    if (this.config.dataSourceId) await this.#pullProjects(this.config.dataSourceId);

    const tasks = new TaskSync(this.userId, this.client);
    for (const project of await this.#linked()) {
      const dataSourceId = project.notionTasksDataSourceId ?? (await this.#findTasks(project.id, project.notionPageId));
      if (dataSourceId) this.#counts.tasks += await tasks.run(project.id, dataSourceId, project.notionTaskMapping);
    }
    this.#counts.people = tasks.peopleSeen;
    return { ...this.#counts };
  }

  async #pullProjects(dataSourceId: string) {
    const pages = await this.client.queryDataSource(dataSourceId);
    const live = pages.filter((page) => !page.in_trash && !page.archived);
    const categoryId = await this.#defaultCategory();
    for (const page of live) await this.#writeProject(page, categoryId);
    await this.#writeParents(live);
  }

  /** The sphere a project mirrored for the first time lands in, until somebody moves it. */
  async #defaultCategory() {
    const spheres = await db.query.categories.findMany({
      where: and(eq(categories.userId, this.userId), eq(categories.archived, false), eq(categories.isBuffer, false)),
    });
    const chosen = spheres.find((one) => one.id === this.config.categoryId);
    const sphere = chosen ?? spheres.find((one) => one.name.trim().toLowerCase() === "projects") ?? spheres[0];
    if (!sphere) throw new ApiError("Put a sphere on the ring before mirroring a Notion workspace.");
    return sphere.id;
  }

  async #writeProject(page: NotionPage, categoryId: string) {
    const titleKey = Object.entries(page.properties).find(([, value]) => (value as { type?: string }).type === "title");
    const name = plainText(titleKey?.[1] as Record<string, unknown>) || "Untitled";
    const existing = await this.#byNotionId(page.id);
    const description = this.#description(page);
    const mirrored = {
      name,
      description,
      icon: page.icon?.emoji ?? null,
      notionUrl: page.url,
      notionEditedAt: new Date(page.last_edited_time),
      archived: false,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(projects).set(mirrored).where(eq(projects.id, existing.id));
    } else {
      await db.insert(projects).values({
        userId: this.userId,
        categoryId,
        notionConnectionId: this.config.connectionId,
        notionPageId: page.id,
        ...mirrored,
      });
    }
    this.#counts.projects += 1;
  }

  /**
   * The sentence under a project's name, from the column somebody said holds it. Nothing is
   * guessed: a database with no such column simply has projects with no description.
   */
  #description(page: NotionPage) {
    const key = this.config.mapping.description;
    return key ? plainText(page.properties[key] as Record<string, unknown> | undefined) : "";
  }

  /** The second pass: a page can name a parent that had not been written when it was read. */
  async #writeParents(pages: readonly NotionPage[]) {
    const byNotionId = new Map((await this.#linked()).map((project) => [project.notionPageId, project.id]));
    for (const page of pages) {
      const child = byNotionId.get(page.id);
      const parentPage = parentOf(page);
      const parentId = parentPage ? (byNotionId.get(parentPage) ?? null) : null;
      if (!child) continue;
      await db.update(projects).set({ parentId, updatedAt: new Date() }).where(eq(projects.id, child));
    }
  }

  async #findTasks(projectId: string, notionPageId: string | null) {
    if (!notionPageId) return null;
    const found = await findTasksDataSource(this.client, notionPageId);
    if (found)
      await db
        .update(projects)
        .set({ notionTasksDataSourceId: found.id, notionTasksName: found.name, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    return found?.id ?? null;
  }

  /** Every project that points at something in this workspace, however it came to. */
  #linked() {
    return db.query.projects.findMany({
      where: and(
        eq(projects.userId, this.userId),
        eq(projects.notionConnectionId, this.config.connectionId),
        eq(projects.archived, false),
        or(isNotNull(projects.notionPageId), isNotNull(projects.notionTasksDataSourceId)),
      ),
    });
  }

  #byNotionId(notionPageId: string) {
    return db.query.projects.findFirst({
      where: and(eq(projects.userId, this.userId), eq(projects.notionPageId, notionPageId)),
    });
  }
}

function parentOf(page: NotionPage) {
  const property = Object.entries(page.properties).find(([name]) => PARENT_NAMES.includes(name.toLowerCase()));
  return relationIds(property?.[1] as Record<string, unknown>)[0] ?? null;
}
