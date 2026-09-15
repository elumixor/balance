import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * The Zoom account an event's call can be made in.
 *
 * Google mints its own Meet and nothing else, so a Zoom room has to be made in Zoom and the link
 * handed to the calendar. That needs a grant, kept the way every other grant here is: encrypted,
 * one row per person, with a `needsReconnect` state the settings row draws rather than a 401
 * nobody can act on. Zoom's access tokens last an hour and its refresh tokens rotate on every
 * renewal, which is why both are written back together.
 */
export const zoomConnections = pgTable("zoom_connections", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** AES-256-GCM, the same cipher the calendar's tokens are under. */
  token: text("token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** What the account calls itself, so the settings row can say which one is connected. */
  accountEmail: text("account_email").notNull().default(""),
  /** True once Zoom stops accepting the grant: the screens ask for another rather than failing. */
  needsReconnect: boolean("needs_reconnect").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const zoomConnectionsRelations = relations(zoomConnections, ({ one }) => ({
  user: one(users, { fields: [zoomConnections.userId], references: [users.id] }),
}));
