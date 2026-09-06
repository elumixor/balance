import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { gateEvents } from "~/db/schema";
import { asNumeric, defined, numeric, TableStore } from "./table-store";

/**
 * A manual observation for a gate. Only `manual` rows are ever written from a client; `product`
 * ones come from the built thing's own ping, and calendar hours are never rows at all.
 */
export const gateEventSchema = z.object({
  id: z.uuid(),
  stageId: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(["manual", "product", "timer"]).default("manual"),
  actorKey: z.string().trim().nullable().default(null),
  note: z.string().trim().nullable().default(null),
  quantity: z.number().min(0).default(1),
});

export type SyncedGateEvent = z.infer<typeof gateEventSchema>;

export const gateEventsModel = syncedModel({
  name: "gateEvents",
  schema: gateEventSchema,
  store: new TableStore<SyncedGateEvent, typeof gateEvents>(gateEvents, {
    missing: "That entry no longer exists.",
    toRecord: (row) => ({
      id: row.id,
      stageId: row.stageId,
      day: row.day,
      source: row.source,
      actorKey: row.actorKey,
      note: row.note,
      quantity: Number(row.quantity),
    }),
    toRow: (userId, r) => ({
      id: r.id,
      userId,
      stageId: r.stageId,
      day: r.day,
      source: r.source,
      actorKey: r.actorKey,
      note: r.note,
      quantity: asNumeric(r.quantity),
    }),
    toPatch: (p) => defined({ day: p.day, actorKey: p.actorKey, note: p.note, quantity: numeric(p.quantity) }),
  }),
  // A row a product reported is the product's word, not the user's to edit.
  writable: (entry) => entry.source === "manual",
});
