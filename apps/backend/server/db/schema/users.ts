import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { eventMappings, providerAccounts } from "./calendar";
import { activities, categories } from "./categories";
import { plannedDays, plannedWeeks, starLedger } from "./planning";
import { gateEvents, goals, practices, projectComparisons, projects, stages, tasks } from "./projects";
import { trackingSessions } from "./tracking";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A phone's standing permission to get itself a new Clerk session without anyone signing in again.
 *
 * The iOS app runs inside WKWebView, which prunes what clerk-js leaves behind — so the session is
 * gone by the next cold start however carefully it is mirrored. This is the grant that survives
 * instead: the app keeps the secret in native storage and trades it for a sign-in ticket on any
 * launch that opens without a session. Only the hash is stored here, and the secret is replaced
 * every time it is spent, so a copy read off a backup is worth one use at most.
 */
export const deviceGrants = pgTable("device_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const deviceGrantsRelations = relations(deviceGrants, ({ one }) => ({
  user: one(users, { fields: [deviceGrants.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  categories: many(categories),
  activities: many(activities),
  providerAccounts: many(providerAccounts),
  eventMappings: many(eventMappings),
  trackingSessions: many(trackingSessions),
  deviceGrants: many(deviceGrants),
  plannedDays: many(plannedDays),
  plannedWeeks: many(plannedWeeks),
  starLedger: many(starLedger),
  goals: many(goals),
  practices: many(practices),
  projects: many(projects),
  stages: many(stages),
  tasks: many(tasks),
  gateEvents: many(gateEvents),
  projectComparisons: many(projectComparisons),
}));
