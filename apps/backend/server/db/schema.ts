import { relations, sql } from "drizzle-orm";
import { boolean, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

export const entries = pgTable("entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  activityId: uuid("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "restrict" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  categories: many(categories),
  activities: many(activities),
  entries: many(entries),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  weights: many(activityCategoryWeights),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  user: one(users, { fields: [activities.userId], references: [users.id] }),
  weights: many(activityCategoryWeights),
  entries: many(entries),
}));

export const activityCategoryWeightsRelations = relations(activityCategoryWeights, ({ one }) => ({
  activity: one(activities, { fields: [activityCategoryWeights.activityId], references: [activities.id] }),
  category: one(categories, { fields: [activityCategoryWeights.categoryId], references: [categories.id] }),
}));

export const entriesRelations = relations(entries, ({ one }) => ({
  user: one(users, { fields: [entries.userId], references: [users.id] }),
  activity: one(activities, { fields: [entries.activityId], references: [activities.id] }),
}));
