import { and, eq, gte } from "drizzle-orm";
import { db } from "~/db";
import { plannedDays, starLedger } from "~/db/schema";
import { addDays, type Day } from "./days";
import { type Award, applyDelta } from "./stars";

/** How far back a streak is worth counting. Past this the answer is "a long time". */
const STREAK_LOOKBACK_DAYS = 60;

/** The star ledger: what has been paid, what it adds up to, and how many days in a row. */
export class StarLedger {
  constructor(private readonly userId: string) {}

  /** The running total, floors and all — see `applyDelta`. */
  async stars(): Promise<number> {
    const rows = await db
      .select({ day: starLedger.day, delta: starLedger.delta })
      .from(starLedger)
      .where(eq(starLedger.userId, this.userId))
      .orderBy(starLedger.createdAt);

    let total = 0;
    for (const row of rows) total = applyDelta(total, row.delta);
    return total;
  }

  /** Planned days ending yesterday, counting back until one is missing. */
  async streak(today: Day): Promise<number> {
    const from = addDays(today, -STREAK_LOOKBACK_DAYS);
    const rows = await db.query.plannedDays.findMany({
      where: and(eq(plannedDays.userId, this.userId), gte(plannedDays.day, from)),
      columns: { day: true },
    });
    const days = new Set(rows.map((row) => row.day));

    let streak = 0;
    for (let day = addDays(today, -1); days.has(day); day = addDays(day, -1)) streak++;
    return streak;
  }

  /** Every payout since `from`, for the settle pass to see what is already paid. */
  since(from: Day) {
    return db.query.starLedger.findMany({
      where: and(eq(starLedger.userId, this.userId), gte(starLedger.day, from)),
    });
  }

  /** Every payout ever, for the record screen. */
  all() {
    return db.query.starLedger.findMany({
      where: eq(starLedger.userId, this.userId),
      columns: { day: true, delta: true, reason: true },
    });
  }

  /** Writes what a rule paid, or leaves the row that is already there — see the ledger's index. */
  async award(day: Day, awards: readonly Award[]): Promise<void> {
    if (awards.length === 0) return;
    await db
      .insert(starLedger)
      .values(awards.map((award) => ({ userId: this.userId, day, delta: award.delta, reason: award.reason })))
      .onConflictDoNothing();
  }
}
