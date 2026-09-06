import { relations, sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { users } from "./users";

/**
 * A stretch of time the user started from the watch rather than planned in advance. The hours
 * still live in the calendar — every session owns a real event, and an instance mapping makes it
 * count toward one category — so this table holds only what the calendar can't say: which category
 * was chosen, when the timer was started, and how long it was meant to run. A null `plannedEndAt`
 * is an open-ended session, and a null `endedAt` is one that is still running.
 */
export const trackingSessions = pgTable(
  "tracking_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** Qualified with the account it belongs to — see `qualifyCalendarId`. */
    calendarId: text("calendar_id").notNull(),
    externalEventId: text("external_event_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /**
     * Whether the event is the session's own — one the timer created, or one nobody else is
     * invited to. A timer started for somebody else's meeting leaves that meeting's times alone.
     */
    ownsEvent: boolean("owns_event").notNull().default(true),
    /**
     * Whether the event was already in the calendar when the timer started — pointed at from a
     * reminder, or matched afterwards — as opposed to one the timer wrote. Only a timer that wrote
     * its own event is asked whether it was really for something planned.
     */
    fromEvent: boolean("from_event").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Two timers running at once would mean two overlapping events nobody asked for, so the
  // database, and not just the service, holds the "one running session per user" rule.
  (table) => [
    uniqueIndex("tracking_sessions_one_running_per_user").on(table.userId).where(sql`${table.endedAt} is null`),
  ],
);

export const trackingSessionsRelations = relations(trackingSessions, ({ one }) => ({
  user: one(users, { fields: [trackingSessions.userId], references: [users.id] }),
  category: one(categories, { fields: [trackingSessions.categoryId], references: [categories.id] }),
}));
