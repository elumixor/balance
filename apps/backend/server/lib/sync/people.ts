import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { people } from "~/db/schema";
import { defined, TableStore } from "./table-store";

/** Somebody the account knows. Never an account of their own — a name, a colour, an address and a face. */
export const personSchema = z.object({
  id: z.uuid(),
  name: z.string().trim(),
  email: z.string().trim().nullable(),
  color: z.string().trim().min(1),
  avatar: z.string().nullable(),
});

export type SyncedPerson = z.infer<typeof personSchema>;

export const peopleModel = syncedModel({
  name: "people",
  schema: personSchema,
  store: new TableStore<SyncedPerson, typeof people>(people, {
    missing: "That person is no longer on your list.",
    toRecord: (row) => ({ id: row.id, name: row.name, email: row.email, color: row.color, avatar: row.avatar }),
    toRow: (userId, r) => ({ id: r.id, userId, name: r.name, email: r.email, color: r.color, avatar: r.avatar }),
    toPatch: (p) => defined({ name: p.name, email: p.email, color: p.color, avatar: p.avatar }),
  }),
});
