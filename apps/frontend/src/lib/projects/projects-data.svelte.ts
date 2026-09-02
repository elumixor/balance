import { clock } from "$lib/clock.svelte";
import { localDay } from "$lib/planning/zone";
import { invalidate, store } from "$lib/store.svelte";
import {
  categories,
  comparisons,
  type DecidePayload,
  gateEvents,
  goals,
  practices,
  projects,
  stages,
  synced,
  syncStatus,
  tasks,
} from "$lib/synced.svelte";
import type { Category, GateProgress, Goal, Practice, Project, ProjectStatus, Stage, Task } from "$lib/types";
import { allocate, overclaim } from "./allocate";
import { daysBetweenKeys, dueCheckpoint } from "./decide-on";
import { type Dimension, nextQuestion, pattern, type Question, rankOrder } from "./ranking";
import { ARCHIVE_STATUSES, type StageTemplate, templateOf } from "./templates";

/** How long after the last keystroke an edit burst counts as finished — one press of undo. */
const BURST_MS = 700;

/** Everything a card draws, worked out once here rather than in every card. */
export interface ProjectCard {
  readonly project: Project;
  readonly category: Category | null;
  readonly goal: Goal | null;
  /** The stage running now, or null between stages and for evergreen projects. */
  readonly stage: Stage | null;
  /** 1-based position of the running stage among the project's stages, for the "2/3" pill. */
  readonly stageIndex: number;
  readonly stageCount: number;
  readonly gate: GateProgress | null;
  /** Days until the decision; negative when overdue; null with no date. */
  readonly daysLeft: number | null;
  readonly hoursByWeek: readonly number[];
  /** A checkpoint that has come round and hasn't been looked at. */
  readonly checkpointDue: string | null;
  /** No goal above it — hours with no sentence saying what they are for. */
  readonly drift: boolean;
  readonly archived: boolean;
}

export interface SphereGroup {
  readonly category: Category;
  readonly cards: readonly ProjectCard[];
  readonly practices: readonly Practice[];
  /** Goals in this sphere with nothing under them — a wish, and the card says so quietly. */
  readonly wishes: readonly Goal[];
  /** How far the sphere's live claims exceed its hours on the ring. Zero is fine. */
  readonly over: number;
}

/**
 * The projects screen and every card on it. Every row is a synced record, so there is nothing to
 * save; what a card shows about evidence comes from `store.progress`, which is the calendar's
 * answer and refetched behind the cards whenever a write could have moved it.
 */
class ProjectsData {
  #burst: ReturnType<typeof setTimeout> | null = null;
  #open = false;

  /** The project that should open its name for typing — consumed once by that row. */
  focusId = $state<string | null>(null);

  ready = $derived(projects.ready && stages.ready && categories.ready && goals.ready);
  loadError = $derived(synced.error);
  error = $derived(syncStatus.rejected);
  progress = $derived(store.progress.value ?? null);

  /** Today's key, ticking with the clock so a card crossing midnight recounts its days. */
  today = $derived(localDay(clock.now));

  categoryById = $derived(new Map(categories.all.map((c) => [c.id, c])));
  goalById = $derived(new Map(goals.all.map((g) => [g.id, g])));
  spheres = $derived(categories.all.filter((c) => !c.isBuffer));

  stagesByProject = $derived.by(() => {
    const map = new Map<string, Stage[]>();
    for (const stage of stages.all) map.set(stage.projectId, [...(map.get(stage.projectId) ?? []), stage]);
    return map;
  });

  tasksByStage = $derived.by(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks.all) map.set(task.stageId, [...(map.get(task.stageId) ?? []), task]);
    return map;
  });

  cards = $derived(projects.all.map((project) => this.cardOf(project)));
  cardById = $derived(new Map(this.cards.map((card) => [card.project.id, card])));

  /** The gallery: every sphere on the ring, in ring order, with what lives under it. */
  groups = $derived.by((): SphereGroup[] =>
    this.spheres.map((category) => ({
      category,
      cards: this.cards.filter((card) => card.project.categoryId === category.id && !card.archived),
      practices: practices.all.filter((p) => p.categoryId === category.id),
      wishes: goals.all.filter(
        (goal) =>
          goal.categoryId === category.id &&
          !projects.all.some((p) => p.goalId === goal.id) &&
          !practices.all.some((p) => p.goalId === goal.id),
      ),
      over: overclaim(category.targetHoursPerWeek, this.claimsIn(category.id)).over,
    })),
  );

  // --- ranking -----------------------------------------------------------------

  /** The live projects of a sphere as claims, in the order the priority ranking has settled so far. */
  claimsIn(categoryId: string) {
    const live = projects.all.filter((p) => p.categoryId === categoryId && p.status === "active");
    const ordered = rankOrder(
      live.map((p) => p.id),
      comparisons.all,
      "priority",
    );
    return ordered.map((id) => ({ id, claimed: live.find((p) => p.id === id)?.hoursPerWeek ?? 0 }));
  }

  /** The next thing worth asking about a sphere: priority first, then fun, or nothing. */
  questionFor(categoryId: string): Question | null {
    const ids = projects.all.filter((p) => p.categoryId === categoryId && p.status === "active").map((p) => p.id);
    return nextQuestion(ids, comparisons.all, "priority") ?? nextQuestion(ids, comparisons.all, "fun");
  }

  observationFor(categoryId: string) {
    const ids = projects.all.filter((p) => p.categoryId === categoryId && p.status === "active").map((p) => p.id);
    return pattern(ids, comparisons.all);
  }

  answer(question: Question, winnerId: string) {
    this.#closeBurst();
    comparisons.create({ aId: question.aId, bId: question.bId, dimension: question.dimension, winnerId });
  }

  /** Forgets one dimension's answers for a sphere, so it can be asked again from the top. */
  forgetRanking(categoryId: string, dimension: Dimension) {
    const ids = new Set(projects.all.filter((p) => p.categoryId === categoryId).map((p) => p.id));
    this.#closeBurst();
    synced.transaction(() => {
      for (const c of comparisons.all) if (c.dimension === dimension && ids.has(c.aId)) comparisons.delete(c.id);
    });
  }

  /** What the ranking says each project should get under the sphere's cap. */
  allocationFor(category: Category) {
    return allocate(category.targetHoursPerWeek, this.claimsIn(category.id));
  }

  /** Writes the fitted hours onto the projects — one step of undo for the whole sphere. */
  applyAllocation(category: Category) {
    this.#closeBurst();
    synced.transaction(() => {
      for (const fit of this.allocationFor(category)) {
        if (fit.hours !== fit.claimed) projects.update(fit.id, { hoursPerWeek: fit.hours });
      }
    });
    invalidate.projects();
  }

  /** Hands a project over to being a practice: the assistant's "this is recurring" answer, accepted. */
  convertToPractice(project: Project) {
    this.#closeBurst();
    const created = synced.transaction(() => {
      const practice = practices.create({
        categoryId: project.categoryId,
        goalId: project.goalId,
        name: project.name,
        unit: "hours",
        targetPerWeek: project.hoursPerWeek,
      });
      projects.delete(project.id);
      return practice;
    });
    invalidate.projects();
    return created;
  }

  /** Every live card, nearest decision first; the dateless ones last. */
  byDecision = $derived(
    this.cards
      .filter((card) => !card.archived)
      .toSorted(
        (a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.project.name.localeCompare(b.project.name),
      ),
  );

  archive = $derived(this.cards.filter((card) => card.archived));

  enter = () => {
    return Promise.all([synced.ensure(), store.progress.ensure()]);
  };

  load = () => Promise.all([synced.sync(), store.progress.refresh()]);

  stagesOf(projectId: string) {
    return this.stagesByProject.get(projectId) ?? [];
  }

  currentStage(projectId: string) {
    return this.stagesOf(projectId).find((s) => s.startedOn && !s.outcome) ?? null;
  }

  // --- writes ---------------------------------------------------------------

  /**
   * Ten seconds with just a name: the sphere is the first one on the ring unless a group's own
   * button said otherwise, the template is the simplest, and everything else is added later —
   * including the first stage, which is only made when the template has one to offer.
   */
  create(categoryId?: string) {
    this.#closeBurst();
    const sphere = categoryId ?? this.spheres[0]?.id;
    if (!sphere) return null;
    const created = synced.transaction(() =>
      projects.create({
        goalId: null,
        categoryId: sphere,
        name: "",
        description: "",
        template: "simple",
        hoursPerWeek: 2,
        status: "active",
        cover: null,
        links: [],
        people: [],
        deadline: null,
        unparkTrigger: null,
      }),
    );
    this.focusId = created.id;
    invalidate.projects();
    return created;
  }

  update(id: string, patch: Partial<Project>) {
    this.#grouped(() => projects.update(id, patch));
  }

  /**
   * Choosing a template lays its stages out — the first one started, the rest waiting — and
   * drops the ones the previous template left that never ran. A stage that has run is history
   * and stays.
   */
  applyTemplate(project: Project, key: Project["template"]) {
    const template = templateOf(key);
    this.#closeBurst();
    synced.transaction(() => {
      projects.update(project.id, { template: key });
      const existing = this.stagesOf(project.id);
      for (const stage of existing) if (!stage.startedOn) stages.delete(stage.id);
      const kept = existing.filter((s) => s.startedOn);
      const running = kept.some((s) => !s.outcome);
      template.stages.forEach((draft, i) => {
        this.#createStage(project.id, draft, kept.length + i, i === 0 && !running);
      });
    });
    invalidate.projects();
  }

  /** A stage typed by hand, after the template's — waiting unless nothing else is running. */
  addStage(project: Project, draft: StageTemplate) {
    this.#closeBurst();
    const existing = this.stagesOf(project.id);
    const running = existing.some((s) => s.startedOn && !s.outcome);
    const created = synced.transaction(() => this.#createStage(project.id, draft, existing.length, !running));
    invalidate.projects();
    return created;
  }

  #createStage(projectId: string, draft: StageTemplate, ordinal: number, start: boolean) {
    return stages.create({
      projectId,
      ordinal,
      name: draft.name,
      sentence: draft.sentence,
      metric: draft.metric,
      threshold: draft.threshold,
      windowDays: draft.windowDays,
      budgetHours: draft.budgetHours,
      startedOn: start ? this.today : null,
      decideOn: null,
      extendedOn: null,
      extensionNote: null,
      outcome: null,
      decidedOn: null,
      decisionNote: null,
      checkpoints: [],
    });
  }

  updateStage(id: string, patch: Partial<Stage>) {
    this.#grouped(() => stages.update(id, patch));
  }

  removeStage(stage: Stage) {
    this.#closeBurst();
    stages.delete(stage.id);
    invalidate.projects();
  }

  /** The button only a person presses. */
  decide(stage: Stage, payload: Omit<DecidePayload, "day">) {
    this.#closeBurst();
    stages.act("decide", stage.id, { ...payload, day: this.today });
    invalidate.projects();
  }

  extend(stage: Stage, note: string) {
    this.#closeBurst();
    stages.act("extend", stage.id, { day: this.today, note });
    invalidate.projects();
  }

  /** "Held" is the one status that is a choice rather than an outcome: passed, and kept here on purpose. */
  setStatus(project: Project, status: ProjectStatus) {
    this.#closeBurst();
    projects.update(project.id, { status });
  }

  logCheckpoint(stage: Stage, entry: { day: string; count: number; moved: boolean; note: string }) {
    this.#closeBurst();
    stages.update(stage.id, { checkpoints: [...stage.checkpoints.filter((c) => c.day !== entry.day), entry] });
  }

  addTask(stageId: string, title: string) {
    this.#closeBurst();
    const ordinal = (this.tasksByStage.get(stageId)?.length ?? 0) + 1;
    return tasks.create({ stageId, title, estimateHours: null, done: false, ordinal });
  }

  updateTask(id: string, patch: Partial<Task>) {
    this.#grouped(() => tasks.update(id, patch));
  }

  removeTask(id: string) {
    this.#closeBurst();
    tasks.delete(id);
  }

  /** A manual row for what nothing can observe. It looks manual on the screen, and it is undoable. */
  logManual(stageId: string, entry: { actorKey: string | null; note: string | null; quantity: number }) {
    this.#closeBurst();
    gateEvents.create({ stageId, day: this.today, source: "manual", ...entry });
    invalidate.projects();
  }

  removeManual(id: string) {
    this.#closeBurst();
    gateEvents.delete(id);
    invalidate.projects();
  }

  createGoal(categoryId: string, statement: string) {
    this.#closeBurst();
    return goals.create({ categoryId, statement, measure: null, horizon: null });
  }

  updateGoal(id: string, patch: Partial<Goal>) {
    this.#grouped(() => goals.update(id, patch));
  }

  removeGoal(id: string) {
    this.#closeBurst();
    goals.delete(id);
  }

  createPractice(categoryId: string) {
    this.#closeBurst();
    const created = practices.create({ categoryId, goalId: null, name: "", unit: "times", targetPerWeek: 7 });
    this.focusId = created.id;
    return created;
  }

  updatePractice(id: string, patch: Partial<Practice>) {
    this.#grouped(() => practices.update(id, patch));
  }

  removePractice(practice: Practice) {
    if (!confirm(`Remove "${practice.name || "this practice"}"? Past hours stay tagged to it.`)) return;
    this.#closeBurst();
    practices.delete(practice.id);
  }

  removeProject(project: Project) {
    const message = `Delete "${project.name || "this project"}"? A finished project is shipped or killed instead, and keeps its card.`;
    if (!confirm(message)) return false;
    this.#closeBurst();
    projects.delete(project.id);
    invalidate.projects();
    return true;
  }

  // --- derivations ------------------------------------------------------------

  private cardOf(project: Project): ProjectCard {
    const own = this.stagesOf(project.id);
    const stage = own.find((s) => s.startedOn && !s.outcome) ?? null;
    const progress = this.progress?.projects[project.id] ?? null;
    const decideOn = stage?.decideOn ?? null;
    return {
      project,
      category: this.categoryById.get(project.categoryId) ?? null,
      goal: project.goalId ? (this.goalById.get(project.goalId) ?? null) : null,
      stage,
      stageIndex: stage ? own.indexOf(stage) + 1 : own.filter((s) => s.outcome).length,
      stageCount: own.length,
      gate: progress?.stageId === stage?.id ? (progress?.gate ?? null) : null,
      daysLeft: decideOn ? daysBetweenKeys(this.today, decideOn) : null,
      hoursByWeek: progress?.hoursByWeek ?? [],
      checkpointDue:
        stage?.startedOn && stage.decideOn
          ? dueCheckpoint({
              startedOn: stage.startedOn,
              decideOn: stage.decideOn,
              today: this.today,
              looked: stage.checkpoints.map((c) => c.day),
            })
          : null,
      drift: !project.goalId && project.status === "active",
      archived: ARCHIVE_STATUSES.includes(project.status),
    };
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
