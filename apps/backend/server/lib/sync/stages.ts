import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { stages } from "~/db/schema";
import { dayField } from "~/lib/http/schemas";
import { defined, TableStore } from "./table-store";

/** A band across a project's timeline. Its dates are optional: without them it spans its tasks. */
export const stageSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string().trim(),
  ordinal: z.number().int(),
  startsOn: dayField.nullable().default(null),
  endsOn: dayField.nullable().default(null),
});

export type SyncedStage = z.infer<typeof stageSchema>;

export const stagesModel = syncedModel({
  name: "stages",
  schema: stageSchema,
  store: new TableStore<SyncedStage, typeof stages>(stages, {
    missing: "That stage no longer exists.",
    toRecord: (row) => ({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      ordinal: row.ordinal,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
    }),
    toRow: (userId, r) => ({
      id: r.id,
      userId,
      projectId: r.projectId,
      name: r.name,
      ordinal: r.ordinal,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
    }),
    toPatch: (p) =>
      defined({ projectId: p.projectId, name: p.name, ordinal: p.ordinal, startsOn: p.startsOn, endsOn: p.endsOn }),
  }),
});
