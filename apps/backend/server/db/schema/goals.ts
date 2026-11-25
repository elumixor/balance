import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { users } from "./users";

/** One rung of a goal's ladder: what a period has to reach while the goal stands on it. */
export interface GoalLevel {
  target: number;
  /** What the rung is called: "Twenty minutes". */
  label?: string;
}

/** What a progress entry measured. Numbers count toward a target; the rest is detail kept beside them. */
export type GoalMetrics = Record<string, number | string | boolean | null>;

/**
 * Something a person means to keep doing, with a number to reach every day or every week.
 *
 * The Goals module stands on its own: these three tables, `/api/goals`, `docs/goals.md`. The one
 * thread to the rest of the app is `sphereId`, which only says which sphere the goal belongs
 * with. The level a goal stands on and its streak are never stored: they are replayed from its
 * progress on every read (`lib/goals/ladder.ts`).
 */
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The name an app hard-codes: "meditation". Unique per account. */
    key: text("key").notNull(),
    title: text("title").notNull(),
    /** What sort of practice it is: "meditation", "reading". Free text, for the app that reads it. */
    kind: text("kind").notNull(),
    /** The key in an entry's `metrics` the target is measured on: "minutes". */
    metric: text("metric").notNull(),
    /** How a period's entries become one number: "sum" | "max" | "count". */
    aggregate: text("aggregate").notNull().default("sum"),
    /** "daily" | "weekly". */
    cadence: text("cadence").notNull().default("daily"),
    /** The zone a day of this goal is a day in. */
    timeZone: text("time_zone").notNull(),
    /** The ladder, easiest first. A goal with one rung never moves. */
    levels: jsonb("levels").$type<GoalLevel[]>().notNull(),
    /** Periods met in a row on a rung before the goal steps up. */
    advanceAfter: integer("advance_after").notNull().default(3),
    /** Periods missed in a row before it steps down. */
    easeAfter: integer("ease_after").notNull().default(2),
    /** The first day that counts, in the goal's zone. */
    startsOn: text("starts_on").notNull(),
    sphereId: uuid("sphere_id").references(() => categories.id, { onDelete: "set null" }),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("goals_user_key").on(table.userId, table.key)],
);

/**
 * One thing an app says happened toward a goal: a sitting, a run, a chapter.
 *
 * `(user, source, externalId)` is the row's identity, so an upload retried after a dropped reply
 * writes nothing twice.
 */
export const goalProgress = pgTable(
  "goal_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    /** When it happened. */
    at: timestamp("at", { withTimezone: true }).notNull(),
    metrics: jsonb("metrics").$type<GoalMetrics>().notNull(),
    /** The app that said so. */
    source: text("source").notNull(),
    /** The app's own id for the entry. */
    externalId: text("external_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("goal_progress_unique").on(table.userId, table.source, table.externalId),
    index("goal_progress_goal_at").on(table.goalId, table.at),
  ],
);

/**
 * A key one app holds, and only for goals: it can do what its `scopes` name and nothing else in
 * the account. Stored as a hash, shown once, revoked by deleting the row.
 */
export const goalTokens = pgTable("goal_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** What a person calls the app holding it. */
  name: text("name").notNull(),
  /** The `source` written on every entry this key posts. */
  source: text("source").notNull(),
  /** Any of "read", "progress", "manage". */
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goalTokensRelations = relations(goalTokens, ({ one }) => ({
  user: one(users, { fields: [goalTokens.userId], references: [users.id] }),
}));
