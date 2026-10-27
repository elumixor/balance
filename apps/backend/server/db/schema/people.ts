import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Somebody the account knows: invited to its events. A person is a name, an address, a colour and
 * a face — never an account of their own. The list is seeded from the guest lists of recent
 * events, so it is full before anybody is asked to type.
 */
export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  /** A hex colour for the avatar, so a face nobody uploaded still reads as one person. */
  color: text("color").notNull().default("#8b8b8b"),
  /** A face: a small data URL uploaded here, or the address of the picture Google keeps for them. */
  avatar: text("avatar"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const peopleRelations = relations(people, ({ one }) => ({
  user: one(users, { fields: [people.userId], references: [users.id] }),
}));
