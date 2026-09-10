import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { tasks } from "~/db/schema";
import { dayField } from "~/lib/http/schemas";
import { asNumeric, defined, numericOrNull, TableStore } from "./table-store";

export const taskStatusSchema = z.enum(["todo", "doing", "blocked", "done", "dropped"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

/**
 * One bar on the timeline. `statusLabel` is the board's own word for where it is — kept beside
 * the status the app counts by, so a column called "Ready For Test" survives the round trip.
 */
export const taskSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  stageId: z.uuid().nullable().default(null),
  parentId: z.uuid().nullable().default(null),
  title: z.string().trim(),
  description: z.string().default(""),
  status: taskStatusSchema.default("todo"),
  statusLabel: z.string().trim().default(""),
  priority: taskPrioritySchema.nullable().default(null),
  startsOn: dayField.nullable().default(null),
  endsOn: dayField.nullable().default(null),
  assigneeIds: z.array(z.uuid()).default([]),
  estimateHours: z.number().min(0).nullable().default(null),
  ordinal: z.number().int().default(0),
  notionUrl: z.string().nullable().default(null),
});

export type SyncedTask = z.infer<typeof taskSchema>;

export const tasksModel = syncedModel({
  name: "tasks",
  schema: taskSchema,
  store: new TableStore<SyncedTask, typeof tasks>(tasks, {
    missing: "That task no longer exists.",
    toRecord: (row) => ({
      id: row.id,
      projectId: row.projectId,
      stageId: row.stageId,
      parentId: row.parentId,
      title: row.title,
      description: row.description,
      status: row.status,
      statusLabel: row.statusLabel,
      priority: row.priority,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      assigneeIds: row.assigneeIds,
      estimateHours: row.estimateHours === null ? null : Number(row.estimateHours),
      ordinal: row.ordinal,
      notionUrl: row.notionUrl,
    }),
    toRow: (userId, r) => ({
      id: r.id,
      userId,
      projectId: r.projectId,
      stageId: r.stageId,
      parentId: r.parentId,
      title: r.title,
      description: r.description,
      status: r.status,
      statusLabel: r.statusLabel,
      priority: r.priority,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      assigneeIds: r.assigneeIds,
      estimateHours: r.estimateHours === null ? null : asNumeric(r.estimateHours),
      ordinal: r.ordinal,
    }),
    toPatch: (p) =>
      defined({
        projectId: p.projectId,
        stageId: p.stageId,
        parentId: p.parentId,
        title: p.title,
        description: p.description,
        status: p.status,
        statusLabel: p.statusLabel,
        priority: p.priority,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        assigneeIds: p.assigneeIds,
        estimateHours: numericOrNull(p.estimateHours),
        ordinal: p.ordinal,
      }),
  }),
});
