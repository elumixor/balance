import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { projects } from "~/db/schema";
import { asNumeric, defined, numeric, TableStore } from "./table-store";

export const projectStatusSchema = z.enum(["active", "paused", "done", "dropped"]);

/**
 * A project as both halves agree it looks. The Notion columns travel with it but are never taken
 * from a client write: they say where a row came from, and only a sync may answer that.
 */
export const projectSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  categoryId: z.uuid(),
  name: z.string().trim(),
  description: z.string(),
  icon: z.string().trim().nullable(),
  status: projectStatusSchema,
  hoursPerWeek: z.number().min(0).max(168),
  memberIds: z.array(z.uuid()),
  ordinal: z.number().int(),
  notionUrl: z.string().nullable(),
  notionConnectionId: z.uuid().nullable(),
  notionTasksDataSourceId: z.string().nullable(),
  notionViewId: z.string().nullable(),
  notionTasksName: z.string().nullable(),
  notionTaskMapping: z
    .object({
      status: z.string().nullable(),
      dates: z.string().nullable(),
      assignee: z.string().nullable(),
      parent: z.string().nullable(),
    })
    .nullable(),
  notionTaskFilter: z.object({ assignees: z.array(z.string()) }).nullable(),
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
      memberIds: row.memberIds,
      ordinal: row.ordinal,
      notionUrl: row.notionUrl,
      notionConnectionId: row.notionConnectionId,
      notionTasksDataSourceId: row.notionTasksDataSourceId,
      notionViewId: row.notionViewId,
      notionTasksName: row.notionTasksName,
      notionTaskMapping: row.notionTaskMapping,
      notionTaskFilter: row.notionTaskFilter,
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
        memberIds: p.memberIds,
        ordinal: p.ordinal,
      }),
  }),
});
