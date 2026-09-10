import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * The one Notion workspace an account mirrors its projects from.
 *
 * The grant is an OAuth one, encrypted the same way a calendar's refresh token is: the pages it
 * opens are the pages somebody ticked on Notion's own consent screen, so the app never asks for a
 * secret and never asks anybody to share a database with it by hand. What it points at is one
 * database of projects, chosen after connecting; everything else — which page holds a project's
 * tasks, who the people are — is found from there on every sync.
 */
export const notionConnections = pgTable("notion_connections", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  /** Notion's newer grants expire; the refresh token is how the mirror keeps running unattended. */
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  /** The Notion data source of projects, chosen from what the grant can see. Null until it is. */
  projectsDataSourceId: text("projects_data_source_id"),
  workspaceId: text("workspace_id").notNull().default(""),
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
