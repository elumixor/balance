import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * The one Notion workspace an account mirrors its projects from.
 *
 * The grant is an integration token somebody pasted, encrypted the same way a calendar's refresh
 * token is — it opens every page that workspace has shared with the integration, so it never sits
 * in the database in the clear. What it points at is one database of projects; everything else —
 * which page holds a project's tasks, who the people are — is found from there on every sync.
 */
export const notionConnections = pgTable("notion_connections", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  /** The Notion database of projects, as an id — a URL somebody pasted is reduced to this. */
  projectsDatabaseId: text("projects_database_id").notNull(),
  /** What the workspace calls itself, for the settings row to say which one is connected. */
  workspaceName: text("workspace_name").notNull().default(""),
  /** True once a token stops being accepted: the screens say "reconnect" rather than failing. */
  needsReconnect: boolean("needs_reconnect").notNull().default(false),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  /** What the last sync failed with, in words, or null when it went through. */
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const notionConnectionsRelations = relations(notionConnections, ({ one }) => ({
  user: one(users, { fields: [notionConnections.userId], references: [users.id] }),
}));
