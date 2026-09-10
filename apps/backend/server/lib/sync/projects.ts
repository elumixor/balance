import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { projects } from "~/db/schema";
import { asNumeric, defined, numeric, TableStore } from "./table-store";

export const projectStatusSchema = z.enum(["active", "paused", "done", "dropped"]);

const fieldSchema = z.object({
  id: z.string().min(1),
  icon: z.string().trim().default("circle"),
  label: z.string().trim(),
  type: z.enum(["text", "date", "number", "url"]).default("text"),
  value: z.string().default(""),
});

/**
 * A project as both halves agree it looks. The Notion columns travel with it but are never taken
 * from a client write: they say where a row came from, and only a sync may answer that.
 */
export const projectSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable().default(null),
  categoryId: z.uuid(),
  name: z.string().trim(),
  description: z.string().default(""),
  icon: z.string().trim().nullable().default(null),
  status: projectStatusSchema.default("active"),
  hoursPerWeek: z.number().min(0).max(168).default(0),
  fields: z.array(fieldSchema).default([]),
  memberIds: z.array(z.uuid()).default([]),
  ordinal: z.number().int().default(0),
  notionUrl: z.string().nullable().default(null),
});

export type SyncedProject = z.infer<typeof projectSchema>;

export const projectsModel = syncedModel({
  name: "projects",
  schema: projectSchema,
  store: new TableStore<SyncedProject, typeof projects>(projects, {
    missing: "That project no longer exists.",
    toRecord: (row) => ({
      id: row.id,
      parentId: row.parentId,
      categoryId: row.categoryId,
      name: row.name,
      description: row.description,
      icon: row.icon,
      status: row.status,
      hoursPerWeek: Number(row.hoursPerWeek),
      fields: row.fields,
      memberIds: row.memberIds,
      ordinal: row.ordinal,
      notionUrl: row.notionUrl,
    }),
    toRow: (userId, r) => ({
      id: r.id,
      userId,
      parentId: r.parentId,
      categoryId: r.categoryId,
      name: r.name,
      description: r.description,
      icon: r.icon,
      status: r.status,
      hoursPerWeek: asNumeric(r.hoursPerWeek),
      fields: r.fields,
      memberIds: r.memberIds,
      ordinal: r.ordinal,
    }),
    toPatch: (p) =>
      defined({
        parentId: p.parentId,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        icon: p.icon,
        status: p.status,
        hoursPerWeek: numeric(p.hoursPerWeek),
        fields: p.fields,
        memberIds: p.memberIds,
        ordinal: p.ordinal,
      }),
  }),
});
