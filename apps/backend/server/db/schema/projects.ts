import { relations } from "drizzle-orm";
import {
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
 * A statement about the world — "sleep eight hours", "ship a game people pay for". It holds no
 * hours, ever: caps live on categories, claims on projects and practices, and a goal is only the
 * sentence that says what those hours are for. Optional above every project, and worth noticing
 * when absent (a project with no goal is drifting) or childless (a goal with no work is a wish).
 */
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** The sphere the goal belongs to — a category on the ring. */
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  statement: text("statement").notNull(),
  /** How it would be known to be true, in words. Optional. */
  measure: text("measure"),
  /** By when, as a plain `YYYY-MM-DD`, or null for "ongoing". */
  horizon: date("horizon"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Something recurring that never completes — sleep, meals, sadhana — measured only by whether
 * it kept happening. Its hours are whatever the calendar says was tagged to it; the target is
 * how often, or how much, a week should hold.
 */
export const practices = pgTable("practices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
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

/** A project's status. Everything but `active` is a deliberate state a person chose. */
export type ProjectStatus = "active" | "held" | "parked" | "shipped" | "killed";

export interface ProjectLink {
  label: string;
  url: string;
}

/**
 * Bounded work that claims hours a week from a sphere and ends in a decision. The lifecycle —
 * how many stages, what kind of gate each has — comes from its template; the engine below never
 * branches on it. A project is never deleted: a killed or shipped one keeps its card.
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** build | search | delivery | exit | evergreen | simple — a row in the client's table. */
  template: text("template").notNull().default("simple"),
  hoursPerWeek: numeric("hours_per_week", { precision: 5, scale: 2 }).notNull().default("0"),
  status: text("status").$type<ProjectStatus>().notNull().default("active"),
  /** An emoji, or an image URL. Null falls back to the sphere's icon. */
  cover: text("cover"),
  links: jsonb("links").$type<ProjectLink[]>().notNull().default([]),
  people: jsonb("people").$type<string[]>().notNull().default([]),
  /** Delivery-type projects take an external date instead of deriving one. */
  deadline: date("deadline"),
  /** What has to be true before a parked project is worth restarting. */
  unparkTrigger: text("unpark_trigger"),
  /** Only for a project made by mistake: a finished one is `shipped` or `killed` and keeps its card. */
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** What a gate counts. The template offers a subset; the counting never changes. */
export type GateMetric = "days" | "people" | "throughput" | "event" | "hours";
/** How a stage ended. `extend` is not one: it moves the date once and is logged on the stage. */
export type StageOutcome = "ship" | "park" | "kill" | "restart";

/** A fortnightly look at the number — see `stages.checkpoints`. */
export interface Checkpoint {
  day: string;
  count: number;
  moved: boolean;
  note: string;
}

/**
 * One gate on the way through a project: a sentence, a count, a threshold, a window and the day
 * it will be decided on. The date is derived when the stage starts and never edited — the one
 * extension a stage may take is its own column, so it is visible, and it can only happen once.
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
    ordinal: integer("ordinal").notNull(),
    name: text("name").notNull(),
    /** "Three people other than me have used it for a week." */
    sentence: text("sentence").notNull().default(""),
    metric: text("metric").$type<GateMetric>().notNull().default("days"),
    threshold: integer("threshold").notNull().default(1),
    /** The window the count is taken over, ending on the decision day. */
    windowDays: integer("window_days").notNull().default(14),
    /** How much work the stage is thought to be — with the project's rate, what sets the date. */
    budgetHours: numeric("budget_hours", { precision: 6, scale: 2 }).notNull().default("0"),
    /** Both null while the stage is waiting for the one before it. */
    startedOn: date("started_on"),
    decideOn: date("decide_on"),
    /** The one extension, when it was taken and for what. */
    extendedOn: date("extended_on"),
    extensionNote: text("extension_note"),
    outcome: text("outcome").$type<StageOutcome>(),
    decidedOn: date("decided_on"),
    decisionNote: text("decision_note"),
    checkpoints: jsonb("checkpoints").$type<Checkpoint[]>().notNull().default([]),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("stages_ordinal_per_project").on(table.projectId, table.ordinal)],
);

/** A checklist item under a stage. Never required; may carry an estimate and be put on the week. */
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => stages.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  estimateHours: numeric("estimate_hours", { precision: 5, scale: 2 }),
  done: boolean("done").notNull().default(false),
  ordinal: integer("ordinal").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Where a gate observation came from. Calendar hours are never rows here — they are resolved live. */
export type GateSource = "manual" | "product" | "timer";

/**
 * One thing a gate can count that the calendar cannot observe: a handover meeting that happened,
 * an application sent, a distinct person the built product reported. Manual rows look manual on
 * the screen; the `product` ones arrive from a ping.
 */
export const gateEvents = pgTable("gate_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => stages.id, { onDelete: "cascade" }),
  /** The user's day, as the device named it. */
  day: date("day").notNull(),
  source: text("source").$type<GateSource>().notNull().default("manual"),
  /** Who or what this was — the key a distinct-people gate deduplicates on. */
  actorKey: text("actor_key"),
  note: text("note"),
  quantity: numeric("quantity", { precision: 8, scale: 2 }).notNull().default("1"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * One answer to "A or B?" for two projects in the same sphere, on one dimension. Kept as answers
 * rather than as a ranking: the order is derived, transitively, from whatever has been asked, so
 * only the comparisons that are actually needed ever get asked — and the pattern across them
 * (fun beating priority) is a thing the answers can say and a ranking cannot.
 */
export const projectComparisons = pgTable("project_comparisons", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  aId: uuid("a_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  bId: uuid("b_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** "priority" or "fun". */
  dimension: text("dimension").notNull(),
  winnerId: uuid("winner_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const projectComparisonsRelations = relations(projectComparisons, ({ one }) => ({
  user: one(users, { fields: [projectComparisons.userId], references: [users.id] }),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  user: one(users, { fields: [goals.userId], references: [users.id] }),
  category: one(categories, { fields: [goals.categoryId], references: [categories.id] }),
  projects: many(projects),
  practices: many(practices),
}));

export const practicesRelations = relations(practices, ({ one }) => ({
  user: one(users, { fields: [practices.userId], references: [users.id] }),
  goal: one(goals, { fields: [practices.goalId], references: [goals.id] }),
  category: one(categories, { fields: [practices.categoryId], references: [categories.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  goal: one(goals, { fields: [projects.goalId], references: [goals.id] }),
  category: one(categories, { fields: [projects.categoryId], references: [categories.id] }),
  stages: many(stages),
}));

export const stagesRelations = relations(stages, ({ one, many }) => ({
  user: one(users, { fields: [stages.userId], references: [users.id] }),
  project: one(projects, { fields: [stages.projectId], references: [projects.id] }),
  tasks: many(tasks),
  gateEvents: many(gateEvents),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  user: one(users, { fields: [tasks.userId], references: [users.id] }),
  stage: one(stages, { fields: [tasks.stageId], references: [stages.id] }),
}));

export const gateEventsRelations = relations(gateEvents, ({ one }) => ({
  user: one(users, { fields: [gateEvents.userId], references: [users.id] }),
  stage: one(stages, { fields: [gateEvents.stageId], references: [stages.id] }),
}));
