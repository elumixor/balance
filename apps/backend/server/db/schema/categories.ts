import { relations, sql } from "drizzle-orm";
import { boolean, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { eventMappings } from "./calendar";
import { trackingSessions } from "./tracking";
import { users } from "./users";

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
