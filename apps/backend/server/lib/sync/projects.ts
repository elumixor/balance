import { syncedModel } from "@elumixor/synced/server";
import { z } from "zod";
import { projects } from "../../db/schema";
import { asNumeric, defined, numeric, TableStore } from "./table-store";

export const projectStatusSchema = z.enum(["active", "held", "parked", "shipped", "killed"]);
export const projectTemplateSchema = z.enum(["build", "search", "delivery", "exit", "evergreen", "simple"]);

/**
 * A project as both halves agree it looks. Status is written by the client for `held` — the one
 * status that is a choice rather than an outcome — and by the decision action for the rest; a
 * client that sets `shipped` by hand is only ever describing what the action already did.
 */
export const projectSchema = z.object({
  id: z.uuid(),
  goalId: z.uuid().nullable().default(null),
  categoryId: z.uuid(),
  name: z.string().trim(),
  description: z.string().default(""),
  template: projectTemplateSchema.default("simple"),
  hoursPerWeek: z.number().min(0).max(168).default(0),
  status: projectStatusSchema.default("active"),
  cover: z.string().trim().nullable().default(null),
  links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  people: z.array(z.string()).default([]),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  unparkTrigger: z.string().nullable().default(null),
});

export type SyncedProject = z.infer<typeof projectSchema>;

export const projectsModel = syncedModel({
  name: "projects",
  schema: projectSchema,
  store: new TableStore<SyncedProject, typeof projects>(projects, {
    missing: "That project no longer exists.",
    toRecord: (row) => ({
      id: row.id,
      goalId: row.goalId,
      categoryId: row.categoryId,
      name: row.name,
      description: row.description,
      template: projectTemplateSchema.catch("simple").parse(row.template),
      hoursPerWeek: Number(row.hoursPerWeek),
      status: row.status,
      cover: row.cover,
      links: row.links,
      people: row.people,
      deadline: row.deadline,
      unparkTrigger: row.unparkTrigger,
    }),
    toRow: (userId, r) => ({
      id: r.id,
      userId,
      goalId: r.goalId,
      categoryId: r.categoryId,
      name: r.name,
      description: r.description,
      template: r.template,
      hoursPerWeek: asNumeric(r.hoursPerWeek),
      status: r.status,
      cover: r.cover,
      links: r.links,
      people: r.people,
      deadline: r.deadline,
      unparkTrigger: r.unparkTrigger,
    }),
    toPatch: (p) =>
      defined({
        goalId: p.goalId,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        template: p.template,
        hoursPerWeek: numeric(p.hoursPerWeek),
        status: p.status,
        cover: p.cover,
        links: p.links,
        people: p.people,
        deadline: p.deadline,
        unparkTrigger: p.unparkTrigger,
      }),
  }),
});
