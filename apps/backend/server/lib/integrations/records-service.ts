import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { integrationRecords } from "../../db/schema";

const PROVIDER = "google";

export interface IntegrationRecordInput {
  readonly calendarId: string;
  readonly externalEventId: string;
  readonly data: Record<string, unknown>;
}

export interface IntegrationRecord extends IntegrationRecordInput {
  readonly source: string;
}

/**
 * What integrations have observed about the user's events. The device that can read a source
 * writes these; every screen reads them off the event they belong to.
 */
export class IntegrationRecordService {
  constructor(private readonly userId: string) {}

  /** One write per occurrence, replacing whatever the last sync said about it. */
  async upsertMany(source: string, records: readonly IntegrationRecordInput[]): Promise<void> {
    if (records.length === 0) return;
    await db
      .insert(integrationRecords)
      .values(
        records.map((record) => ({
          userId: this.userId,
          source,
          provider: PROVIDER,
          calendarId: record.calendarId,
          externalEventId: record.externalEventId,
          data: record.data,
        })),
      )
      .onConflictDoUpdate({
        target: [
          integrationRecords.userId,
          integrationRecords.source,
          integrationRecords.provider,
          integrationRecords.calendarId,
          integrationRecords.externalEventId,
        ],
        set: { data: sql`excluded.data`, recordedAt: new Date() },
      });
  }

  /** Every record the user has — the week grid needs them all at once, like the mappings. */
  async all(): Promise<IntegrationRecord[]> {
    const rows = await db.query.integrationRecords.findMany({
      where: and(eq(integrationRecords.userId, this.userId), eq(integrationRecords.provider, PROVIDER)),
    });
    return rows.map((row) => ({
      source: row.source,
      calendarId: row.calendarId,
      externalEventId: row.externalEventId,
      data: row.data,
    }));
  }
}
