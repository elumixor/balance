import { relations } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { users } from "./users";

/**
 * What the projects database's columns mean. Only the one the app can't guess is here: which
 * column is the sentence under the name. Everything about tasks is on the project that links them,
 * because a task database is a different database per project.
 */
export interface NotionMapping {
  description: string | null;
}

/**
 * Which property of a task database answers each of the things the app draws, by Notion's
 * property id so a rename in Notion keeps it. Chosen when a project is linked, from what was
 * detected by type and name; null means the board has no such property.
 */
export interface NotionTaskMapping {
  status: string | null;
  dates: string | null;
  assignee: string | null;
  parent: string | null;
}

/**
 * Which of a task database's rows are one project's, beyond what a view already filters: the
 * people (Notion user ids, or the pages of a people database) whose tasks to keep. Empty keeps all.
 */
export interface NotionTaskFilter {
  assignees: string[];
}

/**
 * One Notion workspace an account has granted this app, as the account that granted it.
 *
 * A grant is per workspace — Notion's consent screen is where somebody picks one — so an account
 * with two workspaces, or two Notion logins, holds two rows. The grant is an OAuth one, encrypted
 * the same way a calendar's refresh token is: the pages it opens are the pages somebody ticked on
 * Notion's own consent screen, so the app never asks for a secret. A row may also name one
 * database of projects to import; the task databases projects are linked to live on the projects.
 */
export const notionConnections = pgTable(
  "notion_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    /** Notion's newer grants expire; the refresh token is how the mirror keeps running unattended. */
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** The Notion data source of projects, chosen from what the grant can see. Null until it is. */
    projectsDataSourceId: text("projects_data_source_id"),
    /** The sphere imported projects land in — the one thing Notion has no answer for. */
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** What each column of that database means here, as somebody said it does. */
    mapping: jsonb("mapping").$type<NotionMapping>().notNull().default({ description: null }),
    workspaceId: text("workspace_id").notNull().default(""),
    /** What the workspace calls itself, for every picker to say which one this is. */
    workspaceName: text("workspace_name").notNull().default(""),
    /** An emoji or an image URL — whatever Notion keeps as the workspace's icon. */
    workspaceIcon: text("workspace_icon"),
    /** The Notion login that made the grant, so two accounts' workspaces read as two accounts. */
    accountName: text("account_name").notNull().default(""),
    accountEmail: text("account_email").notNull().default(""),
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
  },
  (table) => [uniqueIndex("notion_connections_workspace_per_user").on(table.userId, table.workspaceId)],
);

export const notionConnectionsRelations = relations(notionConnections, ({ one }) => ({
  user: one(users, { fields: [notionConnections.userId], references: [users.id] }),
}));
