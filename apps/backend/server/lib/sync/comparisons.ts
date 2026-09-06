import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { projectComparisons } from "~/db/schema";
import { defined, TableStore } from "./table-store";

export const comparisonSchema = z.object({
  id: z.uuid(),
  aId: z.uuid(),
  bId: z.uuid(),
  dimension: z.enum(["priority", "fun"]),
  winnerId: z.uuid(),
});

export type SyncedComparison = z.infer<typeof comparisonSchema>;

export const comparisonsModel = syncedModel({
  name: "comparisons",
  schema: comparisonSchema,
  store: new TableStore<SyncedComparison, typeof projectComparisons>(projectComparisons, {
    missing: "That comparison no longer exists.",
    toRecord: (row) => ({
      id: row.id,
      aId: row.aId,
      bId: row.bId,
      dimension: row.dimension === "fun" ? "fun" : "priority",
      winnerId: row.winnerId,
    }),
    toRow: (userId, r) => ({ id: r.id, userId, aId: r.aId, bId: r.bId, dimension: r.dimension, winnerId: r.winnerId }),
    toPatch: (p) => defined({ winnerId: p.winnerId }),
  }),
});
