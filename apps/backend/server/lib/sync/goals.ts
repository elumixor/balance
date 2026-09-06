import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { goals } from "~/db/schema";
import { defined, TableStore } from "./table-store";

/** A goal holds no hours, and the schema is where that rule lives: there is no field for them. */
export const goalSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  statement: z.string().trim(),
  measure: z.string().trim().nullable().default(null),
  horizon: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});

export type SyncedGoal = z.infer<typeof goalSchema>;

export const goalsModel = syncedModel({
  name: "goals",
  schema: goalSchema,
  store: new TableStore<SyncedGoal, typeof goals>(goals, {
    missing: "That goal no longer exists.",
    toRecord: (row) => ({
      id: row.id,
      categoryId: row.categoryId,
      statement: row.statement,
      measure: row.measure,
      horizon: row.horizon,
    }),
    toRow: (userId, r) => ({
      id: r.id,
      userId,
      categoryId: r.categoryId,
      statement: r.statement,
      measure: r.measure,
      horizon: r.horizon,
    }),
    toPatch: (p) =>
      defined({ categoryId: p.categoryId, statement: p.statement, measure: p.measure, horizon: p.horizon }),
  }),
});
