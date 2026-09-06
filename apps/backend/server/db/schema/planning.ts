import { relations } from "drizzle-orm";
import { boolean, date, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * A day the user actually sat down and planned, one row per day they finished the session on.
 *
 * The day is the *user's* day, as a plain `YYYY-MM-DD` — not an instant. Nothing here knows what
 * "today" is: the device says which day it is planning and in which zone, because the device is
 * the only party that knows, and a phone that crosses a border should not lose its streak to a
 * server still doing arithmetic in UTC.
 *
 * `coveragePercent` is what the day looked like at the moment it was committed, kept so a later
 * review can say what was promised without re-resolving a week that has since been edited.
 */
/** One block of the day as it was drawn — see `plannedDays.blocks`. */
export interface PlannedBlock {
  id: string;
  /** Milliseconds since the epoch: an instant, unlike the day it belongs to. */
  start: number;
  end: number;
  categoryId: string | null;
}

export const plannedDays = pgTable(
  "planned_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    /** The zone the day was named in, so a stored day can be turned back into real instants. */
    timeZone: text("time_zone").notNull(),
    /** True when the day was planned the evening before rather than on the morning of. */
    ahead: boolean("ahead").notNull(),
    /** A day deliberately left empty. Keeps the streak, earns the base star and no bonuses. */
    rest: boolean("rest").notNull().default(false),
    coveragePercent: integer("coverage_percent").notNull().default(0),
    /**
     * The day as it was drawn, at the moment it was committed: `{ id, start, end, categoryId }`
     * per block. Kept because "did the day go as planned" has no answer otherwise — the calendar
     * only ever holds the day as it ended up, and a block that was moved at noon leaves no trace.
     */
    blocks: jsonb("blocks").$type<PlannedBlock[]>().notNull().default([]),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("planned_days_one_per_day").on(table.userId, table.day)],
);

/** The longer Sunday sitting, kept apart from the daily one because it pays differently. */
export const plannedWeeks = pgTable(
  "planned_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The Monday of the week being planned, as a plain day in the user's zone. */
    weekStart: date("week_start").notNull(),
    timeZone: text("time_zone").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("planned_weeks_one_per_week").on(table.userId, table.weekStart)],
);

/**
 * Every star ever won or lost, as the writes that made them rather than a running total.
 *
 * A total would be one integer and no story. This way the review screen can say *why* it went up
 * without inventing the sentence, a bonus that arrives a day late is just another row, and a rule
 * we get wrong is repaired by rewriting rows rather than by trusting a counter nobody can audit.
 */
export const starLedger = pgTable(
  "star_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The day the stars are *for*, which is not always the day they were awarded. */
    day: date("day").notNull(),
    delta: integer("delta").notNull(),
    /** Which rule paid — see `server/lib/planning/stars.ts`. */
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One payout per rule per day: the missed-day sweep and the bonus pass both run whenever a
  // session opens, and neither knows whether it has run today already.
  (table) => [uniqueIndex("star_ledger_one_per_reason").on(table.userId, table.day, table.reason)],
);

/**
 * What a session says, written once and read twice.
 *
 * The notification has to carry real words while the phone is asleep, so the text is made ahead of
 * time and handed to iOS with the schedule. Tapping it then opens a screen that must say the same
 * thing — so the screen reads this row rather than asking for a fresh sentence that would quietly
 * disagree with the banner the user just read.
 */
export const sessionCopy = pgTable(
  "session_copy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    /** `evening`, `morning` or `weekly`. */
    slot: text("slot").notNull(),
    /** Title, body and points — see `SessionCopy` in `server/lib/planning/copy.ts`. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("session_copy_one_per_slot").on(table.userId, table.day, table.slot)],
);

export const plannedDaysRelations = relations(plannedDays, ({ one }) => ({
  user: one(users, { fields: [plannedDays.userId], references: [users.id] }),
}));

export const plannedWeeksRelations = relations(plannedWeeks, ({ one }) => ({
  user: one(users, { fields: [plannedWeeks.userId], references: [users.id] }),
}));

export const starLedgerRelations = relations(starLedger, ({ one }) => ({
  user: one(users, { fields: [starLedger.userId], references: [users.id] }),
}));

export const sessionCopyRelations = relations(sessionCopy, ({ one }) => ({
  user: one(users, { fields: [sessionCopy.userId], references: [users.id] }),
}));
