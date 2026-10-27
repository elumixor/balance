import { relations } from "drizzle-orm";
import { boolean, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { users } from "./users";

/**
 * Something recurring that never completes — sleep, meals, sadhana — measured only by whether it
 * kept happening. It has no end, so it is never a project in Kip.
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

export const practicesRelations = relations(practices, ({ one }) => ({
  user: one(users, { fields: [practices.userId], references: [users.id] }),
  category: one(categories, { fields: [practices.categoryId], references: [categories.id] }),
}));
