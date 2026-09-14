import { and, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { eventMappings, eventMappingWeights } from "~/db/schema";
import { bufferCategoryService } from "~/lib/categories/buffer";
import { ActivityService, type ActivityWeightInput } from "~/lib/categories/service";
import { ApiError } from "~/lib/http/api-error";
import { eventCache } from "./event-cache";
import type { EventTimer, MappingScope } from "./types";

export interface MappingKey {
  readonly calendarId: string;
  readonly scope: MappingScope;
  readonly externalEventId: string;
}

/** What an hour was for, on top of what it counts as. Any may be null; a task implies its project. */
export interface MappingPurpose {
  readonly projectId: string | null;
  readonly practiceId: string | null;
  readonly taskId: string | null;
  /** How a timer for the event is broken up; null when it just runs to the end. */
  readonly timer: EventTimer | null;
  /** The integration feed the event is linked to, or null. A series link covers every occurrence. */
  readonly source: string | null;
  /** The card sections folded away on the event; null means the default. */
  readonly hidden: string[] | null;
  /** Where the person is once the event is over — see the schema. */
  readonly endLocation: string | null;
  /** The person's own notes about the event, which no guest of it can see. */
  readonly notes: string | null;
}

export interface MappingInput extends MappingKey, Partial<MappingPurpose> {
  readonly activityId?: string | null;
  readonly weights?: ActivityWeightInput[];
}

/** A mapping with its category weights already worked out, whichever side they came from. */
export interface ResolvedMapping extends MappingKey, MappingPurpose {
  readonly activityId: string | null;
  readonly activityName: string | null;
  readonly weights: ActivityWeightInput[];
}

const PROVIDER = "google";

/**
 * What each of a user's external calendar events counts as. Every write here ends by forgetting
 * the user's cached weeks: a mapping is half of what a resolved event is, and a memo made before
 * it would hand the old answer back for thirty seconds.
 */
export class EventMappingService {
  constructor(private readonly userId: string) {}

  /**
   * An event either counts as an activity — the normal case, inheriting whatever mix that
   * activity has — or carries its own category weights as a one-off exception.
   */
  async upsert(input: MappingInput): Promise<ResolvedMapping> {
    const usesActivity = Boolean(input.activityId);
    const usesWeights = Boolean(input.weights?.length);
    if (usesActivity === usesWeights) {
      throw new ApiError("A mapping needs either an activity or its own category weights, not both");
    }

    const values = {
      userId: this.userId,
      provider: PROVIDER,
      calendarId: input.calendarId,
      scope: input.scope,
      externalEventId: input.externalEventId,
      activityId: input.activityId ?? null,
      projectId: input.projectId ?? null,
      practiceId: input.practiceId ?? null,
      taskId: input.taskId ?? null,
      timer: input.timer ?? null,
      source: input.source ?? null,
      hidden: input.hidden ?? null,
      endLocation: input.endLocation ?? null,
      notes: input.notes ?? null,
    };
    const [mapping] = await db
      .insert(eventMappings)
      .values(values)
      .onConflictDoUpdate({
        target: [
          eventMappings.userId,
          eventMappings.provider,
          eventMappings.calendarId,
          eventMappings.scope,
          eventMappings.externalEventId,
        ],
        // A purpose left out of the write is left as it was: setting a category must not untag
        // the project, and tagging a project must not touch what the event counts as.
        set: {
          activityId: values.activityId,
          ...(input.projectId === undefined ? {} : { projectId: values.projectId }),
          ...(input.practiceId === undefined ? {} : { practiceId: values.practiceId }),
          ...(input.taskId === undefined ? {} : { taskId: values.taskId }),
          ...(input.timer === undefined ? {} : { timer: values.timer }),
          ...(input.source === undefined ? {} : { source: values.source }),
          ...(input.hidden === undefined ? {} : { hidden: values.hidden }),
          ...(input.endLocation === undefined ? {} : { endLocation: values.endLocation }),
          ...(input.notes === undefined ? {} : { notes: values.notes }),
        },
      })
      .returning();

    await db.delete(eventMappingWeights).where(eq(eventMappingWeights.mappingId, mapping.id));
    if (!usesWeights) {
      eventCache.invalidate(this.userId);
      return this.resolveOne(mapping.id);
    }

    // Same rule as an activity's own split: whatever the user left unclaimed is buffer time.
    const weights = await new ActivityService(this.userId).resolveWeightsWithBufferRemainder(input.weights ?? []);
    await db
      .insert(eventMappingWeights)
      .values(
        weights.map((w) => ({ mappingId: mapping.id, categoryId: w.categoryId, weightPercent: w.weightPercent })),
      );
    eventCache.invalidate(this.userId);
    return this.resolveOne(mapping.id);
  }

  /**
   * A one-off made into a series keeps its id and becomes the master, so the instance mapping it
   * had would cover none of the occurrences; the reverse strands a series mapping on a one-off.
   * The row moves scope instead. When the other scope already has a row, that one stands and this
   * one goes — a series mapping wins over an instance one anyway.
   */
  async rescope(key: MappingKey, scope: MappingScope): Promise<void> {
    if (key.scope === scope) return;
    const other = await db.query.eventMappings.findFirst({
      where: this.whereKey({ ...key, scope }),
    });
    if (other) {
      await this.remove(key);
      return;
    }
    await db.update(eventMappings).set({ scope }).where(this.whereKey(key));
    eventCache.invalidate(this.userId);
  }

  /**
   * The same mapping under another event — for the second half of a series split in two, which
   * has to count as what the whole did. A mapping the target already has stands.
   */
  async copy(from: MappingKey, toEventId: string, toCalendarId = from.calendarId): Promise<void> {
    const source = await db.query.eventMappings.findFirst({ where: this.whereKey(from), with: { weights: true } });
    if (!source) return;
    await this.upsert({
      calendarId: toCalendarId,
      scope: from.scope,
      externalEventId: toEventId,
      activityId: source.activityId,
      weights: source.activityId
        ? undefined
        : source.weights.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent })),
      projectId: source.projectId,
      practiceId: source.practiceId,
      taskId: source.taskId,
      timer: source.timer as EventTimer | null,
      source: source.source,
      hidden: source.hidden,
      endLocation: source.endLocation,
      notes: source.notes,
    });
  }

  /**
   * The same mapping, under the event's new home — an event handed to another calendar is still
   * the same hour, and what it counts as travels with it. The old row goes, since nothing points
   * at it any more.
   */
  async relocate(from: MappingKey, to: { calendarId: string; externalEventId: string }): Promise<void> {
    if (from.calendarId === to.calendarId && from.externalEventId === to.externalEventId) return;
    await this.copy(from, to.externalEventId, to.calendarId);
    await this.remove(from);
  }

  /**
   * Everything this app knows about an event that has just changed calendars: both scopes, and —
   * when the move kept the event's id, which a hand-over between two accounts doesn't — the
   * occurrence rows underneath a series, whose ids are the master's with a date on the end.
   */
  async relocateEvent(
    from: { calendarId: string; eventId: string },
    to: { calendarId: string; eventId: string },
  ): Promise<void> {
    if (from.calendarId === to.calendarId && from.eventId === to.eventId) return;
    for (const scope of ["instance", "series"] as const) {
      await this.relocate(
        { calendarId: from.calendarId, scope, externalEventId: from.eventId },
        { calendarId: to.calendarId, externalEventId: to.eventId },
      );
    }
    if (from.eventId !== to.eventId) return;
    await db
      .update(eventMappings)
      .set({ calendarId: to.calendarId })
      .where(
        and(
          eq(eventMappings.userId, this.userId),
          eq(eventMappings.provider, PROVIDER),
          eq(eventMappings.calendarId, from.calendarId),
          sql`starts_with(${eventMappings.externalEventId}, ${`${from.eventId}_`})`,
        ),
      );
    eventCache.invalidate(this.userId);
  }

  /**
   * A write about an event that isn't about what it counts as — a private note, the place it
   * ends at. Those live on the mapping, so an event without one is first given one: whatever it
   * already counts as stands, and a block that counted as nothing becomes buffer time, the same
   * place an hour nobody planned already lands.
   */
  async annotate(key: MappingKey, fields: Partial<MappingPurpose>): Promise<ResolvedMapping> {
    const existing = await db.query.eventMappings.findFirst({ where: this.whereKey(key), with: { weights: true } });
    const weights = existing?.weights.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent })) ?? [];
    if (existing?.activityId) return this.upsert({ ...key, ...fields, activityId: existing.activityId });
    if (weights.length > 0) return this.upsert({ ...key, ...fields, weights });
    const buffer = await bufferCategoryService.ensure(this.userId);
    return this.upsert({ ...key, ...fields, weights: [{ categoryId: buffer.id, weightPercent: 100 }] });
  }

  async remove(key: MappingKey): Promise<void> {
    await db.delete(eventMappings).where(this.whereKey(key));
    eventCache.invalidate(this.userId);
  }

  private whereKey(key: MappingKey) {
    return and(
      eq(eventMappings.userId, this.userId),
      eq(eventMappings.provider, PROVIDER),
      eq(eventMappings.calendarId, key.calendarId),
      eq(eventMappings.scope, key.scope),
      eq(eventMappings.externalEventId, key.externalEventId),
    );
  }

  /** Every mapping the user has, in one query — the week grid needs them all at once anyway. */
  async all(): Promise<ResolvedMapping[]> {
    const rows = await db.query.eventMappings.findMany({
      where: and(eq(eventMappings.userId, this.userId), eq(eventMappings.provider, PROVIDER)),
      with: { weights: true, activity: { with: { weights: true } } },
    });
    return rows.map((row) => this.toResolved(row));
  }

  private async resolveOne(id: string): Promise<ResolvedMapping> {
    const row = await db.query.eventMappings.findFirst({
      where: eq(eventMappings.id, id),
      with: { weights: true, activity: { with: { weights: true } } },
    });
    if (!row) throw new Error(`Mapping ${id} vanished as it was being saved`);
    return this.toResolved(row);
  }

  private toResolved(row: {
    calendarId: string;
    scope: string;
    externalEventId: string;
    activityId: string | null;
    projectId: string | null;
    practiceId: string | null;
    taskId: string | null;
    timer: EventTimer | null;
    source: string | null;
    hidden: string[] | null;
    endLocation: string | null;
    notes: string | null;
    activity: { name: string; weights: { categoryId: string; weightPercent: number }[] } | null;
    weights: { categoryId: string; weightPercent: number }[];
  }): ResolvedMapping {
    const weights = row.activity ? row.activity.weights : row.weights;
    return {
      calendarId: row.calendarId,
      scope: row.scope as MappingScope,
      externalEventId: row.externalEventId,
      activityId: row.activityId,
      activityName: row.activity?.name ?? null,
      projectId: row.projectId,
      practiceId: row.practiceId,
      taskId: row.taskId,
      timer: row.timer,
      source: row.source,
      hidden: row.hidden,
      endLocation: row.endLocation,
      notes: row.notes,
      weights: weights.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent })),
    };
  }
}
