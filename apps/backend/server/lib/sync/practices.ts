import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { practices } from "~/db/schema";
import { asNumeric, defined, numeric, TableStore } from "./table-store";

export const practiceSchema = z.object({
  id: z.uuid(),
  goalId: z.uuid().nullable().default(null),
  categoryId: z.uuid(),
  name: z.string().trim(),
  unit: z.enum(["times", "hours"]).default("times"),
  targetPerWeek: z.number().min(0).max(168).default(7),
});

export type SyncedPractice = z.infer<typeof practiceSchema>;

export const practicesModel = syncedModel({
  name: "practices",
  schema: practiceSchema,
  store: new TableStore<SyncedPractice, typeof practices>(practices, {
    missing: "That practice no longer exists.",
    toRecord: (row) => ({
      id: row.id,
      goalId: row.goalId,
      categoryId: row.categoryId,
      name: row.name,
      unit: row.unit === "hours" ? "hours" : "times",
      targetPerWeek: Number(row.targetPerWeek),
    }),
    toRow: (userId, r) => ({
      id: r.id,
      userId,
      goalId: r.goalId,
      categoryId: r.categoryId,
      name: r.name,
      unit: r.unit,
      targetPerWeek: asNumeric(r.targetPerWeek),
    }),
    toPatch: (p) =>
      defined({
        goalId: p.goalId,
        categoryId: p.categoryId,
        name: p.name,
        unit: p.unit,
        targetPerWeek: numeric(p.targetPerWeek),
      }),
  }),
});
