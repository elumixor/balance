import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { activities, entries } from "../db/schema";

export type ManualEntryInput = {
  activityId: string;
  startedAt: string;
  endedAt: string;
  note?: string | null;
};

const RECENT_ACTIVITIES_LOOKBACK = 100;
const RECENT_ACTIVITIES_LIMIT = 5;
const FREQUENT_ACTIVITIES_LIMIT = 5;
const FREQUENT_ACTIVITIES_WINDOW_DAYS = 30;

/** Timer + manual entry CRUD, and the Track screen's recent/frequent activity suggestions, for a single user. */
export class EntriesService {
  constructor(private readonly userId: string) {}

  /** Start a new timer for the given activity, closing any currently running entry first. */
  async startTimer(activityId: string) {
    if (!activityId) throw new Error("Activity is required");

    const activity = await db.query.activities.findFirst({
      where: and(eq(activities.id, activityId), eq(activities.userId, this.userId)),
    });
    if (!activity) throw new Error("Activity not found");

    const now = new Date();

    // neon-http has no multi-statement transaction support; run sequentially.
    // Safe in practice: a user only ever has one device driving their own timer.
    await this.closeRunningEntry(now);

    const [created] = await db
      .insert(entries)
      .values({ userId: this.userId, activityId, startedAt: now, endedAt: null })
      .returning();

    return created;
  }

  /** Stop the currently running entry for the signed-in user, if any. */
  async stopTimer(): Promise<void> {
    await this.closeRunningEntry(new Date());
  }

  /** Create a manually-logged, already-finished entry. */
  async createManualEntry(input: ManualEntryInput) {
    const { startedAt, endedAt } = this.parseAndValidate(input);

    const activity = await db.query.activities.findFirst({
      where: and(eq(activities.id, input.activityId), eq(activities.userId, this.userId)),
    });
    if (!activity) throw new Error("Activity not found");

    const [created] = await db
      .insert(entries)
      .values({
        userId: this.userId,
        activityId: input.activityId,
        startedAt,
        endedAt,
        note: input.note?.trim() ? input.note.trim() : null,
      })
      .returning();

    return created;
  }

  /** Update an existing (finished) entry. */
  async updateEntry(entryId: string, input: ManualEntryInput) {
    const { startedAt, endedAt } = this.parseAndValidate(input);

    const existing = await db.query.entries.findFirst({
      where: and(eq(entries.id, entryId), eq(entries.userId, this.userId)),
    });
    if (!existing) throw new Error("Entry not found");

    const activity = await db.query.activities.findFirst({
      where: and(eq(activities.id, input.activityId), eq(activities.userId, this.userId)),
    });
    if (!activity) throw new Error("Activity not found");

    const [updated] = await db
      .update(entries)
      .set({
        activityId: input.activityId,
        startedAt,
        endedAt,
        note: input.note?.trim() ? input.note.trim() : null,
      })
      .where(and(eq(entries.id, entryId), eq(entries.userId, this.userId)))
      .returning();

    return updated;
  }

  /** Delete an entry. */
  async deleteEntry(entryId: string): Promise<void> {
    await db.delete(entries).where(and(eq(entries.id, entryId), eq(entries.userId, this.userId)));
  }

  /** Fetch the current running entry, if any. */
  async getRunningEntry() {
    return db.query.entries.findFirst({
      where: and(eq(entries.userId, this.userId), isNull(entries.endedAt)),
      with: { activity: true },
    });
  }

  /** Fetch recent entries + quick-start suggestions, scoped to the signed-in user. */
  async getTrackData(limit = 20) {
    const [recentEntries, recentActivities, frequentActivities] = await Promise.all([
      this.getRecentEntries(limit),
      this.getRecentActivities(),
      this.getFrequentActivities(),
    ]);

    return { entries: recentEntries, recentActivities, frequentActivities };
  }

  private async closeRunningEntry(at: Date): Promise<void> {
    await db
      .update(entries)
      .set({ endedAt: at })
      .where(and(eq(entries.userId, this.userId), isNull(entries.endedAt)));
  }

  private parseAndValidate(input: ManualEntryInput) {
    if (!input.activityId) throw new Error("Activity is required");

    const startedAt = new Date(input.startedAt);
    const endedAt = new Date(input.endedAt);

    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
      throw new Error("Invalid start or end date");
    }
    if (endedAt.getTime() <= startedAt.getTime()) {
      throw new Error("End time must be after start time");
    }

    return { startedAt, endedAt };
  }

  private getRecentEntries(limit: number) {
    return db.query.entries.findMany({
      where: eq(entries.userId, this.userId),
      orderBy: [desc(entries.startedAt)],
      limit,
      with: { activity: true },
    });
  }

  /** Last N distinct non-archived activities used, most recent first. */
  private async getRecentActivities(): Promise<{ id: string; name: string }[]> {
    const rows = await db.query.entries.findMany({
      where: eq(entries.userId, this.userId),
      orderBy: [desc(entries.startedAt)],
      limit: RECENT_ACTIVITIES_LOOKBACK,
      with: { activity: true },
    });

    const seen = new Set<string>();
    const recent: { id: string; name: string }[] = [];
    for (const row of rows) {
      if (row.activity.archived) continue;
      if (seen.has(row.activityId)) continue;
      seen.add(row.activityId);
      recent.push({ id: row.activity.id, name: row.activity.name });
      if (recent.length >= RECENT_ACTIVITIES_LIMIT) break;
    }
    return recent;
  }

  /** Top N non-archived activities by entry count in the trailing window. */
  private async getFrequentActivities(): Promise<{ id: string; name: string }[]> {
    const since = new Date(Date.now() - FREQUENT_ACTIVITIES_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        activityId: entries.activityId,
        name: activities.name,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(entries)
      .innerJoin(activities, eq(activities.id, entries.activityId))
      .where(and(eq(entries.userId, this.userId), gte(entries.startedAt, since), eq(activities.archived, false)))
      .groupBy(entries.activityId, activities.name)
      .orderBy(desc(sql`count(*)`))
      .limit(FREQUENT_ACTIVITIES_LIMIT);

    return rows.map((r) => ({ id: r.activityId, name: r.name }));
  }
}
