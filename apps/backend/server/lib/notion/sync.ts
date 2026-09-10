import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "~/db";
import { categories, projects } from "~/db/schema";
import { ApiError } from "~/lib/http/api-error";
import type { NotionClient, NotionPage } from "./client";
import { findTasksDataSource } from "./discover";
import { fieldsOf, plainText, relationIds } from "./map";
import { TaskSync } from "./tasks";

export interface SyncSummary {
  readonly projects: number;
  readonly tasks: number;
  readonly people: number;
}

const PARENT_NAMES = ["parent project", "parent item", "parent"];

/**
 * One run of the mirror: the projects database and, under each project it holds, the database its
 * tasks live in.
 *
 * Which half wins is a rule rather than a negotiation. **Notion owns everything it is shown** —
 * a project's name, its description, the panel of fields, which tasks exist and what they are
 * called — because that is where the work is actually written. The app owns the three things a
 * person changes while doing the work rather than while planning it: a task's status, its dates
 * and who it is for. Those go up first, so a pull can never overwrite a tap made a second ago.
 */
export class NotionSync {
  #counts = { projects: 0, tasks: 0, people: 0 };

  constructor(
    private readonly userId: string,
    private readonly client: NotionClient,
    private readonly dataSourceId: string,
  ) {}

  async run(): Promise<SyncSummary> {
    const pages = await this.client.queryDataSource(this.dataSourceId);
    const live = pages.filter((page) => !page.in_trash && !page.archived);
    const categoryId = await this.#defaultCategory();
    for (const page of live) await this.#writeProject(page, categoryId);
    await this.#writeParents(live);

    const tasks = new TaskSync(this.userId, this.client);
    for (const project of await this.#mirrored()) {
      const dataSourceId = project.notionTasksDataSourceId ?? (await this.#findTasks(project.id, project.notionPageId));
      if (dataSourceId) this.#counts.tasks += await tasks.run(project.id, dataSourceId);
    }
    this.#counts.people = tasks.peopleSeen;
    return { ...this.#counts };
  }

  /** The sphere a project mirrored for the first time lands in, until somebody moves it. */
  async #defaultCategory() {
    const spheres = await db.query.categories.findMany({
      where: and(eq(categories.userId, this.userId), eq(categories.archived, false), eq(categories.isBuffer, false)),
    });
    const sphere = spheres.find((one) => one.name.trim().toLowerCase() === "projects") ?? spheres[0];
    if (!sphere) throw new ApiError("Put a sphere on the ring before mirroring a Notion workspace.");
    return sphere.id;
  }

  async #writeProject(page: NotionPage, categoryId: string) {
    const titleKey = Object.entries(page.properties).find(([, value]) => (value as { type?: string }).type === "title");
    const name = plainText(titleKey?.[1] as Record<string, unknown>) || "Untitled";
    const existing = await this.#byNotionId(page.id);
    const mirrored = {
      name,
      description: descriptionOf(page),
      icon: page.icon?.emoji ?? null,
      fields: fieldsOf(page.properties, titleKey ? [titleKey[0], DESCRIPTION] : [DESCRIPTION]),
      notionUrl: page.url,
      notionEditedAt: new Date(page.last_edited_time),
      archived: false,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(projects).set(mirrored).where(eq(projects.id, existing.id));
    } else {
      await db.insert(projects).values({ userId: this.userId, categoryId, notionPageId: page.id, ...mirrored });
    }
    this.#counts.projects += 1;
  }

  /** The second pass: a page can name a parent that had not been written when it was read. */
  async #writeParents(pages: readonly NotionPage[]) {
    const byNotionId = new Map((await this.#mirrored()).map((project) => [project.notionPageId, project.id]));
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
    const dataSourceId = await findTasksDataSource(this.client, notionPageId);
    if (dataSourceId)
      await db
        .update(projects)
        .set({ notionTasksDataSourceId: dataSourceId, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    return dataSourceId;
  }

  #mirrored() {
    return db.query.projects.findMany({
      where: and(eq(projects.userId, this.userId), eq(projects.archived, false), isNotNull(projects.notionPageId)),
    });
  }

  #byNotionId(notionPageId: string) {
    return db.query.projects.findFirst({
      where: and(eq(projects.userId, this.userId), eq(projects.notionPageId, notionPageId)),
    });
  }
}

const DESCRIPTION = "Description";

function descriptionOf(page: NotionPage) {
  const property = Object.entries(page.properties).find(([name]) => name.toLowerCase() === DESCRIPTION.toLowerCase());
  return plainText(property?.[1] as Record<string, unknown>);
}

function parentOf(page: NotionPage) {
  const property = Object.entries(page.properties).find(([name]) => PARENT_NAMES.includes(name.toLowerCase()));
  return relationIds(property?.[1] as Record<string, unknown>)[0] ?? null;
}
