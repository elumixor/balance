import { relations, sql } from "drizzle-orm";
import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
});

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
 * calendars the app reads and writes. One row per user per provider, so disconnecting
 * forgets the tokens and the preferences together.
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
  (table) => [uniqueIndex("provider_accounts_user_provider").on(table.userId, table.provider)],
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

export const usersRelations = relations(users, ({ many }) => ({
  categories: many(categories),
  activities: many(activities),
  providerAccounts: many(providerAccounts),
  eventMappings: many(eventMappings),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  weights: many(activityCategoryWeights),
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
