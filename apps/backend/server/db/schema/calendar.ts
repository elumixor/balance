import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { EventTimer } from "~/lib/calendar/types";
import { activities, categories } from "./categories";
import { practices } from "./practices";
import { users } from "./users";

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
    /**
     * What the hour was *for*, on top of what it counts as. The category says which sphere an
     * hour belongs to; the practice is the habit it kept. Null for most hours.
     */
    practiceId: uuid("practice_id").references(() => practices.id, { onDelete: "set null" }),
    /**
     * The work it was for, named in another app — a Keep task is `keep:page/<id>`. Only ever a
     * pointer: nothing here reads what it names.
     */
    urn: text("urn"),
    /**
     * How a timer run for this event is broken up — a nudge every N minutes, or the event split
     * into N parts. The length is never stored: the event's own duration is the timer's. Null
     * means a timer for this event simply runs to the end.
     */
    timer: jsonb("timer").$type<EventTimer>(),
    /**
     * The integration feed this event is linked to — "apple-health:sleep" — so the device that
     * can read the feed knows which occurrences to look up, and the card knows which section to
     * draw. On a series mapping the link covers every occurrence.
     */
    source: text("source"),
    /**
     * The card sections folded away on this event, by id. Null means the card shows its
     * default; a series mapping folds them on every occurrence.
     */
    hidden: jsonb("hidden").$type<string[]>(),
    /**
     * Where the person is once this event is over — a flight's destination, the address a move
     * ends at — and so where the next journey starts. Null for the many events that leave you
     * where you were. The app's own record, so it works on an invitation you can't edit.
     */
    endLocation: text("end_location"),
    /**
     * What the person wants to remember about this meeting, kept here rather than in the event's
     * own notes — a calendar description is part of the invitation, so every guest reads it. A
     * series mapping's notes stand for every occurrence until one writes its own.
     */
    notes: text("notes"),
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

/**
 * What an integration observed for one occurrence of an event it is linked to — the night Apple
 * Health recorded under a "Sleep" block. Read on the device that holds the data, written here so
 * every other screen can show it. Keyed by the occurrence rather than the series, because a
 * record is about one night; the shape of `data` is the feed's own, and the server never reads it.
 */
export const integrationRecords = pgTable(
  "integration_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The feed that made it: "apple-health:sleep". */
    source: text("source").notNull(),
    provider: text("provider").notNull().default("google"),
    calendarId: text("calendar_id").notNull(),
    externalEventId: text("external_event_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("integration_records_unique").on(
      table.userId,
      table.source,
      table.provider,
      table.calendarId,
      table.externalEventId,
    ),
  ],
);

/**
 * Every time the decision model was asked what an unmapped event is for — once per event, or once
 * per series for a repeating one, whatever it answered. The row is what stops the same grey block
 * being asked about on every read of its week; `filed` says the answer was sure enough to become
 * the event's mapping, which is how an auto-filed block is told from one a person filed.
 */
export const eventClassifications = pgTable(
  "event_classifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("google"),
    calendarId: text("calendar_id").notNull(),
    /** "instance" | "series", the same scope the mapping it may have written has. */
    scope: text("scope").notNull(),
    externalEventId: text("external_event_id").notNull(),
    /** The sphere picked, or null for "none of them". */
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    probability: real("probability"),
    confidence: real("confidence"),
    filed: boolean("filed").notNull().default(false),
    model: text("model").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("event_classifications_unique").on(
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

export const providerAccountsRelations = relations(providerAccounts, ({ one }) => ({
  user: one(users, { fields: [providerAccounts.userId], references: [users.id] }),
}));

export const eventMappingsRelations = relations(eventMappings, ({ one, many }) => ({
  user: one(users, { fields: [eventMappings.userId], references: [users.id] }),
  activity: one(activities, { fields: [eventMappings.activityId], references: [activities.id] }),
  weights: many(eventMappingWeights),
  practice: one(practices, { fields: [eventMappings.practiceId], references: [practices.id] }),
}));

export const eventMappingWeightsRelations = relations(eventMappingWeights, ({ one }) => ({
  mapping: one(eventMappings, { fields: [eventMappingWeights.mappingId], references: [eventMappings.id] }),
  category: one(categories, { fields: [eventMappingWeights.categoryId], references: [categories.id] }),
}));
