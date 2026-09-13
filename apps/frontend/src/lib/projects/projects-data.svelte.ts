import { oauthConnect } from "$lib/core/oauth-connect";
import type { Category } from "$lib/core/records";
import { invalidate, store } from "$lib/core/store.svelte";
import { categories, people, practices, projects, stages, synced, syncStatus, tasks } from "$lib/core/synced.svelte";
import { localDay } from "$lib/planning/zone";
import { clock } from "$lib/platform/clock.svelte";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { linkProjectToNotion, startNotionConnect, syncNotion, unlinkProjectFromNotion } from "./queries";
import { completionOf } from "./rollup";
import { descendantsOf, pathTo, rowsOf, treeOf } from "./tree";
import type { Person, Project, ProjectField, ProjectStatus, Stage, Task } from "./types";

/** How long after the last keystroke an edit burst counts as finished — one press of undo. */
const BURST_MS = 700;
/** How often opening the screen is worth another look at the mirrored workspace. */
const SYNC_EVERY_MS = 5 * 60 * 1000;
const DEFAULT_HOURS = 2;

/** Everything a card draws, worked out once here rather than in every card. */
export interface ProjectCard {
  readonly project: Project;
  readonly category: Category | null;
  readonly members: readonly Person[];
  /** Hours the calendar says this project itself had, oldest week first. */
  readonly hoursByWeek: readonly number[];
  /** The same with everything nested under it added in. */
  readonly rolledUpByWeek: readonly number[];
  readonly childCount: number;
  readonly done: number;
  readonly total: number;
  readonly archived: boolean;
}

/**
 * The projects screens and everything on them. Every row is a synced record, so there is nothing
 * to save; the hours come from `store.progress`, which is the calendar's answer, and the tasks
 * come from whatever the Notion mirror last pulled.
 */
class ProjectsData {
  #burst: ReturnType<typeof setTimeout> | null = null;
  #open = false;
  #syncedAt = 0;

  /** The row that should open its name for typing — consumed once by that row. */
  focusId = $state<string | null>(null);

  ready = $derived(projects.ready && stages.ready && tasks.ready && categories.ready);
  loadError = $derived(synced.error);
  error = $derived(syncStatus.rejected);
  progress = $derived(store.progress.value ?? null);
  notion = $derived(store.notion.value ?? null);

  /** Today's key, ticking with the clock so a bar crossing midnight moves with it. */
  today = $derived(localDay(clock.now));

  categoryById = $derived(new Map(categories.all.map((category) => [category.id, category])));
  personById = $derived(new Map(people.all.map((person) => [person.id, person])));
  spheres = $derived(categories.all.filter((category) => !category.isBuffer));

  live = $derived(projects.all.filter((project) => project.status !== "dropped"));
  tree = $derived(treeOf(this.live));

  /** The gallery: every sphere on the ring, in ring order, with the trees that live under it. */
  groups = $derived(
    this.spheres.map((category) => ({
      category,
      nodes: this.tree.filter((node) => node.item.categoryId === category.id),
      practices: practices.all.filter((practice) => practice.categoryId === category.id),
      claimed: this.live
        .filter((project) => project.categoryId === category.id && project.status === "active")
        .reduce((total, project) => total + project.hoursPerWeek, 0),
    })),
  );

  projectById(id: string) {
    return projects.all.find((project) => project.id === id) ?? null;
  }

  /** "ATMA / Hypocrisy / Combat", as its rows — the breadcrumb above a project's name. */
  pathOf(id: string) {
    return pathTo(projects.all, id);
  }

  childrenOf(id: string) {
    return this.live.filter((project) => project.parentId === id).toSorted((a, b) => a.ordinal - b.ordinal);
  }

  stagesOf(projectId: string) {
    return stages.all.filter((stage) => stage.projectId === projectId).toSorted((a, b) => a.ordinal - b.ordinal);
  }

  tasksOf(projectId: string) {
    return tasks.all.filter((task) => task.projectId === projectId);
  }

  /** Every task of a project, top to bottom, each with the depth its indent is drawn from. */
  taskRowsOf(projectId: string, collapsed?: ReadonlySet<string>) {
    return rowsOf(treeOf(this.tasksOf(projectId)), collapsed);
  }

  completionOf(projectId: string, stageId: string | null) {
    const own = this.tasksOf(projectId);
    return completionOf(stageId === null ? own : own.filter((task) => task.stageId === stageId));
  }

  cardOf(project: Project): ProjectCard {
    const progress = this.progress?.projects[project.id] ?? null;
    const completion = this.completionOf(project.id, null);
    return {
      project,
      category: this.categoryById.get(project.categoryId) ?? null,
      members: (project.memberIds ?? [])
        .map((id) => this.personById.get(id))
        .filter((one): one is Person => Boolean(one)),
      hoursByWeek: progress?.hoursByWeek ?? [],
      rolledUpByWeek: progress?.rolledUpByWeek ?? [],
      childCount: this.childrenOf(project.id).length,
      done: completion.done,
      total: completion.total,
      archived: project.status === "done" || project.status === "dropped",
    };
  }

  enter = () => {
    void this.mirror();
    return Promise.all([synced.ensure(), store.progress.ensure(), store.notion.ensure()]);
  };

  load = () => Promise.all([synced.sync(), store.progress.refresh(), store.notion.refresh()]);

  /**
   * A look at the mirrored workspace, at most every few minutes. Its failure is a card in the
   * corner rather than an empty screen: what was pulled last time is still on the device.
   */
  async mirror(force = false) {
    // A run is worth making whenever there is a grant: a database configured in settings is one
    // way projects arrive, and a project linked to a page by hand is the other.
    if (!this.notion?.connected || this.notion.needsReconnect) return null;
    if (!force && Date.now() - this.#syncedAt < SYNC_EVERY_MS) return null;
    this.#syncedAt = Date.now();
    try {
      const answer = await syncNotion();
      store.notion.set(answer.status);
      if (answer.summary) await synced.sync();
      return answer.summary;
    } catch (error) {
      this.#syncedAt = 0;
      diagnostics.report("Projects", error, {
        title: "Couldn't read your Notion workspace.",
        retry: () => void this.mirror(true),
      });
      return null;
    }
  }

  /**
   * A grant, if one is needed.
   *
   * Nothing in the app asks somebody to go and connect something first: an action that needs a
   * connection asks for it at the moment it is pressed, and then carries on with what was
   * actually being done. Returns whether there is one to carry on with.
   */
  async ensureNotion() {
    await store.notion.ensure();
    if (this.notion?.connected && !this.notion.needsReconnect) return true;
    await this.connectNotion();
    return Boolean(this.notion?.connected && !this.notion.needsReconnect);
  }

  /** The consent flow, and the mirror's first run the moment the grant and a database exist. */
  connectNotion(signal?: AbortSignal) {
    return oauthConnect(
      {
        start: (mode, origin) => startNotionConnect(mode, origin),
        poll: async () => {
          await store.notion.refresh();
          return Boolean(store.notion.value?.connected);
        },
        landed: () => void this.mirror(true),
      },
      signal,
    );
  }

  /** Point one project at a Notion page or database, and pull what it holds straight away. */
  async link(projectId: string, target: { id: string; kind: "page" | "database" }) {
    const answer = await linkProjectToNotion({ projectId, ...target });
    store.notion.set(answer.status);
    await synced.sync();
    return answer.summary;
  }

  async unlink(projectId: string) {
    store.notion.set(await unlinkProjectFromNotion(projectId));
    await synced.sync();
  }

  // --- writes ---------------------------------------------------------------

  /**
   * Ten seconds with just a name. A child takes its parent's sphere, because hours have to land
   * on the ring somewhere and a tree split across spheres has no answer for where they went.
   */
  create(parent: Project | null, categoryId?: string) {
    this.#closeBurst();
    const sphere = parent?.categoryId ?? categoryId ?? this.spheres[0]?.id;
    if (!sphere) return null;
    const siblings = parent ? this.childrenOf(parent.id) : this.live.filter((one) => one.parentId === null);
    const created = synced.transaction(() =>
      projects.create({
        parentId: parent?.id ?? null,
        categoryId: sphere,
        name: "",
        description: "",
        icon: null,
        status: "active",
        hoursPerWeek: DEFAULT_HOURS,
        fields: [],
        memberIds: [],
        ordinal: siblings.length,
        notionUrl: null,
      }),
    );
    this.focusId = created.id;
    invalidate.projects();
    return created;
  }

  update(id: string, patch: Partial<Project>) {
    this.#grouped(() => projects.update(id, patch));
  }

  setStatus(project: Project, status: ProjectStatus) {
    this.#closeBurst();
    projects.update(project.id, { status });
    invalidate.projects();
  }

  /** Deleting takes the whole subtree — the confirmation says how much of one there is. */
  remove(project: Project) {
    const under = descendantsOf(projects.all, project.id);
    const also = under.length > 0 ? ` and the ${under.length} under it` : "";
    if (!confirm(`Delete "${project.name || "this project"}"${also}? The hours already logged stay logged.`))
      return false;
    this.#closeBurst();
    synced.transaction(() => {
      for (const child of under) projects.delete(child.id);
      projects.delete(project.id);
    });
    invalidate.projects();
    return true;
  }

  writeField(project: Project, field: ProjectField) {
    const fields = project.fields.some((one) => one.id === field.id)
      ? project.fields.map((one) => (one.id === field.id ? field : one))
      : [...project.fields, field];
    this.#grouped(() => projects.update(project.id, { fields }));
  }

  removeField(project: Project, id: string) {
    this.#closeBurst();
    projects.update(project.id, { fields: project.fields.filter((field) => field.id !== id) });
  }

  toggleMember(project: Project, personId: string) {
    this.#closeBurst();
    const memberIds = project.memberIds.includes(personId)
      ? project.memberIds.filter((id) => id !== personId)
      : [...project.memberIds, personId];
    projects.update(project.id, { memberIds });
  }

  createPerson(name: string) {
    this.#closeBurst();
    return people.create({ name, email: null, color: "#8b8b8b" });
  }

  addStage(projectId: string, name: string) {
    this.#closeBurst();
    const created = stages.create({
      projectId,
      name,
      ordinal: this.stagesOf(projectId).length,
      startsOn: null,
      endsOn: null,
    });
    return created;
  }

  updateStage(id: string, patch: Partial<Stage>) {
    this.#grouped(() => stages.update(id, patch));
  }

  /** The stage goes; its tasks stay, and land back in the project's own list. */
  removeStage(stage: Stage) {
    this.#closeBurst();
    synced.transaction(() => {
      for (const task of this.tasksOf(stage.projectId).filter((one) => one.stageId === stage.id))
        tasks.update(task.id, { stageId: null });
      stages.delete(stage.id);
    });
  }

  addTask(projectId: string, stageId: string | null, parentId: string | null = null) {
    this.#closeBurst();
    const siblings = this.tasksOf(projectId).filter((task) => task.parentId === parentId);
    const created = tasks.create({
      projectId,
      stageId,
      parentId,
      title: "",
      description: "",
      status: "todo",
      statusLabel: "",
      priority: null,
      startsOn: null,
      endsOn: null,
      assigneeIds: [],
      estimateHours: null,
      ordinal: siblings.length,
      notionUrl: null,
    });
    this.focusId = created.id;
    return created;
  }

  updateTask(id: string, patch: Partial<Task>) {
    this.#grouped(() => tasks.update(id, patch));
  }

  /** A task goes with everything under it: a subtask with no parent is work nobody can find. */
  removeTask(task: Task) {
    this.#closeBurst();
    synced.transaction(() => {
      for (const child of descendantsOf(this.tasksOf(task.projectId), task.id)) tasks.delete(child.id);
      tasks.delete(task.id);
    });
  }

  createPractice(categoryId: string) {
    this.#closeBurst();
    const created = practices.create({ categoryId, name: "", unit: "times", targetPerWeek: 7 });
    this.focusId = created.id;
    return created;
  }

  updatePractice(id: string, patch: Partial<(typeof practices)["all"][number]>) {
    this.#grouped(() => practices.update(id, patch));
  }

  removePractice(id: string) {
    this.#closeBurst();
    practices.delete(id);
  }

  #grouped(write: () => void) {
    if (!this.#open) {
      this.#open = true;
      synced.beginStep();
    }
    write();
    if (this.#burst) clearTimeout(this.#burst);
    this.#burst = setTimeout(() => this.#closeBurst(), BURST_MS);
  }

  #closeBurst() {
    if (this.#burst) clearTimeout(this.#burst);
    this.#burst = null;
    if (!this.#open) return;
    this.#open = false;
    synced.commitStep();
  }
}

export const projectsData = new ProjectsData();
