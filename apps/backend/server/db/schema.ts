import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    /** Lucide icon name the category is drawn with; the frontend falls back if it doesn't know one. */
    icon: text("icon").notNull().default("circle"),
    targetHoursPerWeek: numeric("target_hours_per_week", { precision: 5, scale: 2 }).notNull(),
    /** The single system-managed category that absorbs all time unallocated by the user's other categories. */
    isBuffer: boolean("is_buffer").notNull().default(false),
    /** Archiving is how a category is deleted: it stops being offered, past entries keep it. */
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** What `/mobile/sync` compares against — see `server/lib/sync/`. Bumped on every write. */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("categories_one_buffer_per_user").on(table.userId).where(sql`${table.isBuffer}`)],
);

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Bumped by a weight changing too — the split is part of the activity, as far as a client is. */
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Every write `/mobile/sync` has already carried out, by the id the client made up for it.
 *
 * A client that never heard the answer sends the same write again, and applying it twice would
 * mean two rows, or two calendar events. Remembering the id is the whole of what makes a retry
 * free — and it's the only state the sync layer itself owns.
 */
export const syncMutations = pgTable(
  "sync_mutations",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mutationId: text("mutation_id").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.mutationId] })],
);

export const activityCategoryWeights = pgTable("activity_category_weights", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  weightPercent: integer("weight_percent").notNull(),
});

/**
 * A connected external calendar account — the OAuth grant plus which of that account's
 * calendars the app reads and writes. One row per user per provider per external account, so a
 * user can connect several Google accounts and disconnecting one forgets only its own tokens
 * and preferences.
 */
export const providerAccounts = pgTable(
  "provider_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "google" today; the column exists so a second provider is a row, not a migration. */
    provider: text("provider").notNull(),
    /** The provider's own account id, so reconnecting the same account updates in place. */
    externalAccountId: text("external_account_id").notNull(),
    email: text("email"),
    /** AES-256-GCM, never returned by any endpoint. */
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    /** Cached so a page load doesn't cost a token round trip. Same encryption. */
    accessTokenEnc: text("access_token_enc"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    scopes: text("scopes").notNull(),
    /** Set when the provider rejects our refresh token, so the app can ask for a reconnect. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Which calendars the week grid draws. Empty means the primary calendar only. */
    visibleCalendarIds: jsonb("visible_calendar_ids").$type<string[]>().notNull().default([]),
    /** Where dragged activities become events. */
    writeCalendarId: text("write_calendar_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_accounts_user_provider_external").on(table.userId, table.provider, table.externalAccountId),
  ],
);

/**
 * What an external calendar event counts as. `activityId` is the normal case; a null activity
 * means the event carries its own category weights, held in `event_mapping_weights`.
 */
export const eventMappings = pgTable(
  "event_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("google"),
    calendarId: text("calendar_id").notNull(),
    /** "instance" | "series" — an instance mapping always beats the series it belongs to. */
    scope: text("scope").notNull(),
    /** The occurrence's own id for instance scope, the series id for series scope. */
    externalEventId: text("external_event_id").notNull(),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("event_mappings_unique").on(
      table.userId,
      table.provider,
      table.calendarId,
      table.scope,
      table.externalEventId,
    ),
  ],
);

export const eventMappingWeights = pgTable("event_mapping_weights", {
  id: uuid("id").primaryKey().defaultRandom(),
  mappingId: uuid("mapping_id")
    .notNull()
    .references(() => eventMappings.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  weightPercent: integer("weight_percent").notNull(),
});

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Two timers running at once would mean two overlapping events nobody asked for, so the
  // database, and not just the service, holds the "one running session per user" rule.
  (table) => [
    uniqueIndex("tracking_sessions_one_running_per_user").on(table.userId).where(sql`${table.endedAt} is null`),
  ],
);

/**
 * How the user wants to be reminded, and how they get around.
 *
 * Held as one JSON blob rather than a column per setting: these are the app's own preferences,
 * they change shape whenever a screen does, and nothing but the app ever reads them — a migration
 * per checkbox would be all cost and no benefit. Kept on the server rather than on the device so
 * the settings panel says the same thing everywhere, including on the machines that can't act on
 * every one of them.
 */
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A phone's standing permission to get itself a new Clerk session without anyone signing in again.
 *
 * The iOS app runs inside WKWebView, which prunes what clerk-js leaves behind — so the session is
 * gone by the next cold start however carefully it is mirrored. This is the grant that survives
 * instead: the app keeps the secret in native storage and trades it for a sign-in ticket on any
 * launch that opens without a session. Only the hash is stored here, and the secret is replaced
 * every time it is spent, so a copy read off a backup is worth one use at most.
 */
export const deviceGrants = pgTable("device_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

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

export const deviceGrantsRelations = relations(deviceGrants, ({ one }) => ({
  user: one(users, { fields: [deviceGrants.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  categories: many(categories),
  activities: many(activities),
  providerAccounts: many(providerAccounts),
  eventMappings: many(eventMappings),
  trackingSessions: many(trackingSessions),
  deviceGrants: many(deviceGrants),
  plannedDays: many(plannedDays),
  plannedWeeks: many(plannedWeeks),
  starLedger: many(starLedger),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  weights: many(activityCategoryWeights),
  trackingSessions: many(trackingSessions),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  user: one(users, { fields: [activities.userId], references: [users.id] }),
  weights: many(activityCategoryWeights),
  eventMappings: many(eventMappings),
}));

export const activityCategoryWeightsRelations = relations(activityCategoryWeights, ({ one }) => ({
  activity: one(activities, { fields: [activityCategoryWeights.activityId], references: [activities.id] }),
  category: one(categories, { fields: [activityCategoryWeights.categoryId], references: [categories.id] }),
}));

export const providerAccountsRelations = relations(providerAccounts, ({ one }) => ({
  user: one(users, { fields: [providerAccounts.userId], references: [users.id] }),
}));

export const eventMappingsRelations = relations(eventMappings, ({ one, many }) => ({
  user: one(users, { fields: [eventMappings.userId], references: [users.id] }),
  activity: one(activities, { fields: [eventMappings.activityId], references: [activities.id] }),
  weights: many(eventMappingWeights),
}));

export const eventMappingWeightsRelations = relations(eventMappingWeights, ({ one }) => ({
  mapping: one(eventMappings, { fields: [eventMappingWeights.mappingId], references: [eventMappings.id] }),
  category: one(categories, { fields: [eventMappingWeights.categoryId], references: [categories.id] }),
}));

export const trackingSessionsRelations = relations(trackingSessions, ({ one }) => ({
  user: one(users, { fields: [trackingSessions.userId], references: [users.id] }),
  category: one(categories, { fields: [trackingSessions.categoryId], references: [categories.id] }),
}));

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
