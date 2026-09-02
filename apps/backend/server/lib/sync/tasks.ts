import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { tasks } from "../../db/schema";
import { asNumeric, defined, numericOrNull, TableStore } from "./table-store";

export const taskSchema = z.object({
  id: z.uuid(),
  stageId: z.uuid(),
  title: z.string().trim(),
  estimateHours: z.number().min(0).nullable().default(null),
  done: z.boolean().default(false),
  ordinal: z.number().int().default(0),
});

export type SyncedTask = z.infer<typeof taskSchema>;

export const tasksModel = syncedModel({
  name: "tasks",
  schema: taskSchema,
  store: new TableStore<SyncedTask, typeof tasks>(tasks, {
    missing: "That task no longer exists.",
    toRecord: (row) => ({
      id: row.id,
      stageId: row.stageId,
      title: row.title,
      estimateHours: row.estimateHours === null ? null : Number(row.estimateHours),
      done: row.done,
      ordinal: row.ordinal,
    }),
    toRow: (userId, r) => ({
      id: r.id,
      userId,
      stageId: r.stageId,
      title: r.title,
      estimateHours: r.estimateHours === null ? null : asNumeric(r.estimateHours),
      done: r.done,
      ordinal: r.ordinal,
    }),
    toPatch: (p) =>
      defined({
        stageId: p.stageId,
        title: p.title,
        estimateHours: numericOrNull(p.estimateHours),
        done: p.done,
        ordinal: p.ordinal,
      }),
  }),
});
