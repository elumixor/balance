import { index, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { users } from "./users";

/** Where an observation happened, as much of it as its source knew. */
export interface ActivityPlace {
  /** What the source calls it: "Home", "Gym". */
  label?: string;
  latitude?: number;
  longitude?: number;
  /** The id of a place saved in Settings → Places, when the source already matched one. */
  locationId?: string;
  /** The Wi-Fi network the device was on. Kept; nothing reads it yet. */
  wifi?: string;
}

/**
 * Something a device observed the person doing: being at a place, sleeping, travelling, moving.
 *
 * The calendar says what a week was meant to be; these rows say what it was. They are posted by
 * whatever can observe — `POST /mobile/activity` — and are never typed in. `(user, source,
 * externalId)` is the row's identity, so a source that posts the same observation twice, or posts
 * a stay again with a later end while it is still going on, writes one row.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Who observed it: "paigram", or "paigram:location" for one feed of several. */
    source: text("source").notNull(),
    /** The source's own id for the observation. */
    externalId: text("external_id").notNull(),
    /** "location" | "sleep" | "travel" | "activity". A calendar block is never stored here. */
    kind: text("kind").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    place: jsonb("place").$type<ActivityPlace>(),
    /** The sphere these hours are said to be — by a person or by the source. Null lets the rules decide. */
    sphereId: uuid("sphere_id").references(() => categories.id, { onDelete: "set null" }),
    /** Who said `sphereId`: "manual" or "source". A manual answer survives the source posting again. */
    attribution: text("attribution"),
    /** How sure the source is, 0 to 1. Below a half it is drawn but claims no hours. */
    confidence: real("confidence").notNull().default(1),
    /** Whatever else the source sent. Kept as it came, never read. */
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("activity_events_unique").on(table.userId, table.source, table.externalId),
    index("activity_events_user_start").on(table.userId, table.startAt),
  ],
);
