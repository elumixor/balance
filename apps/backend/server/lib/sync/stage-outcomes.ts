import { RejectedError } from "@elumixor/synced/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "~/db";
import { projects, stages } from "~/db/schema";
import { decideOnFor } from "~/lib/projects/decisions";
import { asNumeric } from "./table-store";

type StageRow = typeof stages.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

export interface Restart {
  readonly name: string;
  readonly sentence: string;
  readonly metric: StageRow["metric"];
  readonly threshold: number;
  readonly windowDays: number;
  readonly budgetHours: number;
  /** A parked project comes back with hours; a live one keeps what it had. */
  readonly hoursPerWeek?: number;
}

/** What is written on the stage whatever the outcome: which one, when, and in whose words. */
export interface Decision {
  readonly userId: string;
  readonly stage: StageRow;
  readonly project: ProjectRow;
  readonly day: string;
  readonly note: string;
}

/** The date for a stage starting on `day`, from the project's rate — the only way one is ever set. */
export function dateFor(
  stage: Pick<StageRow, "windowDays"> & { budgetHours: number },
  project: ProjectRow,
  day: string,
) {
  return decideOnFor({
    startedOn: day,
    budgetHours: stage.budgetHours,
    hoursPerWeek: Number(project.hoursPerWeek),
    windowDays: stage.windowDays,
    deadline: project.template === "delivery" ? project.deadline : null,
  });
}

/** The stage that is open on a project, or the next one waiting its turn — whichever comes first. */
export function undecidedStage(projectId: string) {
  return db.query.stages.findFirst({
    where: and(eq(stages.projectId, projectId), eq(stages.archived, false), isNull(stages.outcome)),
    orderBy: asc(stages.ordinal),
  });
}

/** The gate passed. The next stage starts today; when there is none, the project is shipped. */
export async function ship({ project, day }: Decision) {
  const next = await undecidedStage(project.id);
  if (!next) {
    await db.update(projects).set({ status: "shipped", updatedAt: new Date() }).where(eq(projects.id, project.id));
    return;
  }
  const decideOn = dateFor({ budgetHours: Number(next.budgetHours), windowDays: next.windowDays }, project, day);
  await db.update(stages).set({ startedOn: day, decideOn, updatedAt: new Date() }).where(eq(stages.id, next.id));
}

/** Hours go to zero until something the note names comes true. */
export async function park({ project, note }: Decision) {
  await db
    .update(projects)
    .set({ status: "parked", hoursPerWeek: "0", unparkTrigger: note || null, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
}

export async function kill({ project }: Decision) {
  await db.update(projects).set({ status: "killed", updatedAt: new Date() }).where(eq(projects.id, project.id));
}

/** Refused before anything is written, so a same-sentence bet leaves no mark on the stage. */
export function checkRestart({ stage }: Decision, restart: Restart | undefined): Restart {
  if (!restart) throw new RejectedError("A restart needs its new gate.");
  if (restart.sentence.toLowerCase() === stage.sentence.trim().toLowerCase()) {
    throw new RejectedError("A restart is a different bet. The same sentence means it isn't ready.");
  }
  return restart;
}

/** A different bet: a new stage after the last, and the project live again. */
export async function restart({ userId, project, day }: Decision, restart: Restart) {
  const hoursPerWeek = restart.hoursPerWeek ?? Number(project.hoursPerWeek);
  await db
    .update(projects)
    .set({ status: "active", hoursPerWeek: asNumeric(hoursPerWeek), unparkTrigger: null, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  const siblings = await db.query.stages.findMany({ where: eq(stages.projectId, project.id) });
  const ordinal = Math.max(...siblings.map((s) => s.ordinal)) + 1;
  await db.insert(stages).values({
    userId,
    projectId: project.id,
    ordinal,
    name: restart.name,
    sentence: restart.sentence,
    metric: restart.metric,
    threshold: restart.threshold,
    windowDays: restart.windowDays,
    budgetHours: asNumeric(restart.budgetHours),
    startedOn: day,
    decideOn: dateFor(restart, { ...project, hoursPerWeek: asNumeric(hoursPerWeek) }, day),
  });
}
