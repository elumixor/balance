import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

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
