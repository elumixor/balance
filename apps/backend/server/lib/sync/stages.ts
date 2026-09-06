import { action, type Envelope, RejectedError, syncedModel } from "@elumixor/synced/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { projects, stages } from "~/db/schema";
import { dayField as daySchema } from "~/lib/http/schemas";
import { extendedDecideOn } from "~/lib/projects/decisions";
import {
  checkRestart,
  type Decision,
  dateFor,
  kill,
  park,
  type Restart,
  restart,
  ship,
  undecidedStage,
} from "./stage-outcomes";
import { asNumeric, defined, numeric, TableStore } from "./table-store";

export const gateMetricSchema = z.enum(["days", "people", "throughput", "event", "hours"]);
export const stageOutcomeSchema = z.enum(["ship", "park", "kill", "restart"]);

const checkpointSchema = z.object({ day: daySchema, count: z.number(), moved: z.boolean(), note: z.string() });

/**
 * A stage as both halves see it. `decideOn`, `extendedOn`, `outcome` and what goes with them are
 * carried but never taken from a client write: the date is derived here when the stage starts,
 * the extension and the outcome have actions of their own, and a patch naming any of them is
 * quietly a patch to the other fields only.
 */
export const stageSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  ordinal: z.number().int(),
  name: z.string().trim(),
  sentence: z.string().trim().default(""),
  metric: gateMetricSchema.default("days"),
  threshold: z.number().int().min(1).default(1),
  windowDays: z.number().int().min(1).default(14),
  budgetHours: z.number().min(0).default(0),
  /** Set by the client on the stage it wants started now; null for one waiting its turn. */
  startedOn: daySchema.nullable().default(null),
  decideOn: daySchema.nullable().default(null),
  extendedOn: daySchema.nullable().default(null),
  extensionNote: z.string().nullable().default(null),
  outcome: stageOutcomeSchema.nullable().default(null),
  decidedOn: daySchema.nullable().default(null),
  decisionNote: z.string().nullable().default(null),
  checkpoints: z.array(checkpointSchema).default([]),
});

export type SyncedStage = z.infer<typeof stageSchema>;

type Row = typeof stages.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

function toRecord(row: Row): SyncedStage {
  return {
    id: row.id,
    projectId: row.projectId,
    ordinal: row.ordinal,
    name: row.name,
    sentence: row.sentence,
    metric: row.metric,
    threshold: row.threshold,
    windowDays: row.windowDays,
    budgetHours: Number(row.budgetHours),
    startedOn: row.startedOn,
    decideOn: row.decideOn,
    extendedOn: row.extendedOn,
    extensionNote: row.extensionNote,
    outcome: row.outcome,
    decidedOn: row.decidedOn,
    decisionNote: row.decisionNote,
    checkpoints: row.checkpoints,
  };
}

class StageStore extends TableStore<SyncedStage, typeof stages> {
  constructor() {
    super(stages, {
      missing: "That stage no longer exists.",
      toRecord,
      toRow: (userId, r) => ({
        id: r.id,
        userId,
        projectId: r.projectId,
        ordinal: r.ordinal,
        name: r.name,
        sentence: r.sentence,
        metric: r.metric,
        threshold: r.threshold,
        windowDays: r.windowDays,
        budgetHours: asNumeric(r.budgetHours),
        startedOn: r.startedOn,
        checkpoints: r.checkpoints,
      }),
      toPatch: (p) =>
        defined({
          ordinal: p.ordinal,
          name: p.name,
          sentence: p.sentence,
          metric: p.metric,
          threshold: p.threshold,
          windowDays: p.windowDays,
          budgetHours: numeric(p.budgetHours),
          checkpoints: p.checkpoints,
        }),
    });
  }

  /**
   * A stage created as started gets its date here and keeps it. One created waiting gets none
   * until the stage before it ships.
   */
  override async create(userId: string, record: SyncedStage) {
    const project = await projectOf(userId, record.projectId);
    const started = record.startedOn ? await this.#startable(project) : null;
    const decideOn = started ? dateFor(record, project, started) : null;
    await db
      .insert(stages)
      .values({ ...this.options.toRow(userId, record), startedOn: started, decideOn })
      .onConflictDoUpdate({
        target: stages.id,
        set: { ...this.options.toPatch(record), archived: false, updatedAt: new Date() },
        setWhere: eq(stages.userId, userId),
      });
    return this.confirm(userId, record.id);
  }

  /** Two open stages at once would be two decision dates for one project, so the second waits. */
  async #startable(project: ProjectRow) {
    const open = await undecidedStage(project.id);
    if (open?.startedOn)
      throw new RejectedError(`"${open.name}" is still open — decide it before starting another stage.`);
    return today();
  }
}

/** The day the request arrived, by the server's clock — only used where the client sent none. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

async function projectOf(userId: string, projectId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  if (!project) throw new RejectedError("That project no longer exists.");
  return project;
}

async function openStage(userId: string, id: string) {
  const stage = await db.query.stages.findFirst({ where: and(eq(stages.id, id), eq(stages.userId, userId)) });
  if (!stage || stage.archived) throw new RejectedError("That stage no longer exists.");
  if (stage.outcome) throw new RejectedError("That stage has already been decided.");
  if (!stage.startedOn || !stage.decideOn) throw new RejectedError("That stage hasn't started yet.");
  return stage as Row & { startedOn: string; decideOn: string };
}

async function envelope(userId: string, id: string): Promise<Envelope<SyncedStage>> {
  const row = await db.query.stages.findFirst({ where: and(eq(stages.id, id), eq(stages.userId, userId)) });
  if (!row) throw new RejectedError("That stage no longer exists.");
  return { id: row.id, updatedAt: row.updatedAt.getTime(), deleted: row.archived, data: toRecord(row) };
}

const restartSchema = z.object({
  name: z.string().trim().min(1),
  sentence: z.string().trim().min(1),
  metric: gateMetricSchema,
  threshold: z.number().int().min(1),
  windowDays: z.number().int().min(1),
  budgetHours: z.number().min(0),
  /** A parked project comes back with hours; a live one keeps what it had. */
  hoursPerWeek: z.number().min(0).max(168).optional(),
});

const decidePayload = z.object({
  outcome: stageOutcomeSchema,
  day: daySchema,
  note: z.string().trim().default(""),
  restart: restartSchema.optional(),
});

/**
 * The one moment a human presses the button. Nothing here is ever done on its own: the gate
 * passing only makes the button available, and the outcome chosen is written as chosen — first
 * on the stage, then whatever the outcome means for the project, one function each.
 */
const decide = action(decidePayload, async (userId: string, id: string, payload) => {
  const stage = await openStage(userId, id);
  const project = await projectOf(userId, stage.projectId);
  const decision: Decision = { userId, stage, project, day: payload.day, note: payload.note };
  const next = payload.outcome === "restart" ? checkRestart(decision, payload.restart) : undefined;

  await db
    .update(stages)
    .set({ outcome: payload.outcome, decidedOn: payload.day, decisionNote: payload.note, updatedAt: new Date() })
    .where(eq(stages.id, id));
  await apply(payload.outcome, decision, next);
  return envelope(userId, id);
});

/** One named fix, two weeks, once — and it shows on the stage forever after. */
const extend = action(
  z.object({ day: daySchema, note: z.string().trim().min(1) }),
  async (userId: string, id: string, payload) => {
    const stage = await openStage(userId, id);
    if (stage.extendedOn) throw new RejectedError("This stage has had its one extension.");
    await db
      .update(stages)
      .set({
        decideOn: extendedDecideOn(stage.decideOn),
        extendedOn: payload.day,
        extensionNote: payload.note,
        updatedAt: new Date(),
      })
      .where(eq(stages.id, id));
    return envelope(userId, id);
  },
);

/** What each outcome means for the project, once the stage itself is stamped. */
function apply(outcome: z.infer<typeof stageOutcomeSchema>, decision: Decision, next: Restart | undefined) {
  switch (outcome) {
    case "ship":
      return ship(decision);
    case "park":
      return park(decision);
    case "kill":
      return kill(decision);
    case "restart":
      return restart(decision, checkRestart(decision, next));
  }
}

export const stagesModel = syncedModel({
  name: "stages",
  schema: stageSchema,
  store: new StageStore(),
  actions: { decide, extend },
});
