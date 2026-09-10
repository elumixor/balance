import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { users } from "./users";

/**
 * Somebody a project is shared with, or a task is assigned to. A person is a name and a colour
 * here and nothing more: the app never writes to them, invites them or knows their account —
 * the avatars on a project are who else is in it, and the dot on a task is whose it is.
 */
export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  /** A hex colour for the avatar, so a face nobody uploaded still reads as one person. */
  color: text("color").notNull().default("#8b8b8b"),
  /** The Notion person page this mirrors, when the workspace is connected. */
  notionPageId: text("notion_page_id"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** A project's status. `active` is the only one that claims hours. */
export type ProjectStatus = "active" | "paused" | "done" | "dropped";

/**
 * One row of the panel to the right of a project's name — "Start Date", "Estimated Duration",
 * "Dashboard". The app has no opinion about which fields a project has: it draws what is here,
 * in this order, and a Notion sync writes the properties that database happens to define.
 */
export interface ProjectField {
  id: string;
  /** A lucide icon name, drawn before the label. */
  icon: string;
  label: string;
  type: "text" | "date" | "number" | "url";
  value: string;
}

/**
 * Work with a name, under a sphere, that can hold other work. Nesting is the whole shape of it —
 * "ATMA / Hypocrisy / Combat" is three rows with a `parentId` each — and every level is a project
 * with the same fields, so there is no separate kind of thing for the level above or below.
 *
 * A child carries its parent's sphere: hours have to land on the ring somewhere, and a tree whose
 * branches belong to different spheres has no answer for where its hours went.
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => projects.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** An emoji or a lucide icon name. Null falls back to the sphere's icon. */
  icon: text("icon"),
  status: text("status").$type<ProjectStatus>().notNull().default("active"),
  /** What it claims from its sphere. A child claims from the same hours its parent does. */
  hoursPerWeek: numeric("hours_per_week", { precision: 5, scale: 2 }).notNull().default("0"),
  fields: jsonb("fields").$type<ProjectField[]>().notNull().default([]),
  /** Who else is in it — `people.id`s, in the order the avatars are drawn. */
  memberIds: jsonb("member_ids").$type<string[]>().notNull().default([]),
  ordinal: integer("ordinal").notNull().default(0),
  notionPageId: text("notion_page_id"),
  notionUrl: text("notion_url"),
  /** The Notion data source holding this project's tasks, found once and remembered. */
  notionTasksDataSourceId: text("notion_tasks_data_source_id"),
  /** What Notion said this page was last edited at, so a pull knows which half is newer. */
  notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * A band across the top of a project's timeline — "Vertical slice", "Beta". A stage holds no
 * work of its own: the tasks name it, and what it says about progress is counted from them.
 */
export const stages = pgTable(
  "stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ordinal: integer("ordinal").notNull(),
    /** Both null while the stage takes its span from the tasks in it. */
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("stages_ordinal_per_project").on(table.projectId, table.ordinal)],
);

/**
 * Where a task is, as the app counts it. Notion's own word for it is kept beside this, because a
 * board has columns nobody else's vocabulary has — "Ready For Test" is a real place to be — and
 * only the four below decide whether a bar is done, running or waiting.
 */
export type TaskStatus = "todo" | "doing" | "blocked" | "done" | "dropped";
export type TaskPriority = "low" | "medium" | "high" | "critical";

/**
 * One bar on the timeline. Tasks nest — "Task 3.2.1" is a task whose parent is a task — and a
 * parent's dates are its own if it has them and its children's span otherwise, so a plan can be
 * written from the top down or from the bottom up.
 */
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").references(() => stages.id, { onDelete: "set null" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").$type<TaskStatus>().notNull().default("todo"),
  /** What the board this came from calls the column. Empty when the app is the only author. */
  statusLabel: text("status_label").notNull().default(""),
  priority: text("priority").$type<TaskPriority>(),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  /** `people.id`s. A task usually has one; a pair sitting together is two. */
  assigneeIds: jsonb("assignee_ids").$type<string[]>().notNull().default([]),
  estimateHours: numeric("estimate_hours", { precision: 5, scale: 2 }),
  ordinal: integer("ordinal").notNull().default(0),
  notionPageId: text("notion_page_id"),
  notionUrl: text("notion_url"),
  notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Something recurring that never completes — sleep, meals, sadhana — measured only by whether it
 * kept happening. It is not a project and never becomes one: it has no end, so nothing it could
 * be a stage of.
 */
export const practices = pgTable("practices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** "times" a week or "hours" a week — what `targetPerWeek` counts. */
  unit: text("unit").notNull().default("times"),
  targetPerWeek: numeric("target_per_week", { precision: 6, scale: 2 }).notNull().default("7"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const peopleRelations = relations(people, ({ one }) => ({
  user: one(users, { fields: [people.userId], references: [users.id] }),
}));

export const practicesRelations = relations(practices, ({ one }) => ({
  user: one(users, { fields: [practices.userId], references: [users.id] }),
  category: one(categories, { fields: [practices.categoryId], references: [categories.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  parent: one(projects, { fields: [projects.parentId], references: [projects.id], relationName: "children" }),
  children: many(projects, { relationName: "children" }),
  category: one(categories, { fields: [projects.categoryId], references: [categories.id] }),
  stages: many(stages),
  tasks: many(tasks),
}));

export const stagesRelations = relations(stages, ({ one, many }) => ({
  user: one(users, { fields: [stages.userId], references: [users.id] }),
  project: one(projects, { fields: [stages.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, { fields: [tasks.userId], references: [users.id] }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  stage: one(stages, { fields: [tasks.stageId], references: [stages.id] }),
  parent: one(tasks, { fields: [tasks.parentId], references: [tasks.id], relationName: "subtasks" }),
  subtasks: many(tasks, { relationName: "subtasks" }),
}));
