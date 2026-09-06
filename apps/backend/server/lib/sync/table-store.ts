import { type Envelope, type Identified, RejectedError, type SyncedStore } from "@elumixor/synced/server";
import { and, eq, gte } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "~/db";

/** What a table has to have for its rows to travel as synced records. */
export interface SyncedTable extends PgTable {
  readonly id: PgColumn;
  readonly userId: PgColumn;
  readonly updatedAt: PgColumn;
  readonly archived: PgColumn;
}

export interface TableStoreOptions<T extends Identified, Table extends SyncedTable> {
  toRecord(row: Table["$inferSelect"]): T;
  /** The whole row for a create, minus what the table fills in itself. */
  toRow(userId: string, record: T): Table["$inferInsert"];
  /** The columns a patch may touch, in the shape the table wants them. Server-owned fields are dropped here. */
  toPatch(patch: Partial<T>): Partial<Table["$inferInsert"]>;
  missing: string;
}

/**
 * The four queries every table-backed model is, written once.
 *
 * Archiving is deleting: a removed record keeps its row, flagged, and travels as a tombstone.
 * Bringing it back — a redone step — is a create under the same id, which the upsert handles.
 */
export class TableStore<T extends Identified, Table extends SyncedTable> implements SyncedStore<T> {
  constructor(
    protected readonly table: Table,
    protected readonly options: TableStoreOptions<T, Table>,
  ) {}

  async pull(userId: string, since: number) {
    const rows = await db
      .select()
      .from(this.table as PgTable)
      .where(and(eq(this.table.userId, userId), gte(this.table.updatedAt, new Date(since))))
      .orderBy(this.table.updatedAt);
    return rows.map((row) => this.envelopeOf(row as Table["$inferSelect"]));
  }

  async read(userId: string, id: string) {
    const row = await this.row(userId, id);
    return row ? this.options.toRecord(row) : null;
  }

  async create(userId: string, record: T) {
    await db
      .insert(this.table as PgTable)
      .values(this.options.toRow(userId, record) as Record<string, unknown>)
      .onConflictDoUpdate({
        target: this.table.id,
        set: { ...this.options.toPatch(record), archived: false, updatedAt: new Date() },
        setWhere: eq(this.table.userId, userId),
      });
    return this.confirm(userId, record.id);
  }

  async update(userId: string, id: string, patch: Partial<T>) {
    await db
      .update(this.table as PgTable)
      .set({ ...this.options.toPatch(patch), updatedAt: new Date() })
      .where(and(eq(this.table.id, id), eq(this.table.userId, userId)));
    return this.confirm(userId, id);
  }

  async remove(userId: string, id: string) {
    await db
      .update(this.table as PgTable)
      .set({ archived: true, updatedAt: new Date() })
      .where(and(eq(this.table.id, id), eq(this.table.userId, userId)));
    return this.confirm(userId, id);
  }

  protected envelopeOf(row: Table["$inferSelect"]): Envelope<T> {
    const stamped = row as { id: string; updatedAt: Date; archived: boolean };
    return {
      id: stamped.id,
      updatedAt: stamped.updatedAt.getTime(),
      deleted: stamped.archived,
      data: this.options.toRecord(row),
    };
  }

  protected async confirm(userId: string, id: string) {
    const row = await this.row(userId, id);
    if (!row) throw new RejectedError(this.options.missing);
    return this.envelopeOf(row);
  }

  protected async row(userId: string, id: string): Promise<Table["$inferSelect"] | undefined> {
    const [row] = await db
      .select()
      .from(this.table as PgTable)
      .where(and(eq(this.table.id, id), eq(this.table.userId, userId)))
      .limit(1);
    return row as Table["$inferSelect"] | undefined;
  }
}

/**
 * A patch with its absent fields dropped: `{ name: undefined }` would write NULL where the caller
 * meant "leave it alone", and every model's `toPatch` is one of these.
 */
export function defined<T extends object>(patch: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

export const asNumeric = (value: number) => value.toString();
/** A numeric column's patch value: absent stays absent, a number becomes the string Postgres wants. */
export const numeric = (value: number | undefined) => (value === undefined ? undefined : asNumeric(value));
export const numericOrNull = (value: number | null | undefined) =>
  value === undefined ? undefined : value === null ? null : asNumeric(value);
