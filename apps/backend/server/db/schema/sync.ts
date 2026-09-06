import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Every write `/mobile/sync` has already carried out, by the id the client made up for it.
 *
 * A client that never heard the answer sends the same write again, and applying it twice would
 * mean two rows, or two calendar events. Remembering the id is the whole of what makes a retry
 * free — and it's the only state the sync layer itself owns.
 */
export const syncMutations = pgTable(
  "sync_mutations",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mutationId: text("mutation_id").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.mutationId] })],
);
