import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { eventMappings, eventMappingWeights } from "../../db/schema";
import { ApiError } from "../api-error";
import { ActivityService, type ActivityWeightInput } from "../categories-service";
import type { MappingScope } from "./types";

export interface MappingKey {
  readonly calendarId: string;
  readonly scope: MappingScope;
  readonly externalEventId: string;
}

export interface MappingInput extends MappingKey {
  readonly activityId?: string | null;
  readonly weights?: ActivityWeightInput[];
}

/** A mapping with its category weights already worked out, whichever side they came from. */
export interface ResolvedMapping extends MappingKey {
  readonly activityId: string | null;
  readonly activityName: string | null;
  readonly weights: ActivityWeightInput[];
}

const PROVIDER = "google";

/** What each of a user's external calendar events counts as. */
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
        set: { activityId: values.activityId },
      })
      .returning();

    await db.delete(eventMappingWeights).where(eq(eventMappingWeights.mappingId, mapping.id));
    if (!usesWeights) return this.resolveOne(mapping.id);

    // Same rule as an activity's own split: whatever the user left unclaimed is buffer time.
    const weights = await new ActivityService(this.userId).resolveWeightsWithBufferRemainder(input.weights ?? []);
    await db
      .insert(eventMappingWeights)
      .values(
        weights.map((w) => ({ mappingId: mapping.id, categoryId: w.categoryId, weightPercent: w.weightPercent })),
      );
    return this.resolveOne(mapping.id);
  }

  async remove(key: MappingKey): Promise<void> {
    await db
      .delete(eventMappings)
      .where(
        and(
          eq(eventMappings.userId, this.userId),
          eq(eventMappings.provider, PROVIDER),
          eq(eventMappings.calendarId, key.calendarId),
          eq(eventMappings.scope, key.scope),
          eq(eventMappings.externalEventId, key.externalEventId),
        ),
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
    if (!row) throw new ApiError("The mapping vanished as it was being saved", 500);
    return this.toResolved(row);
  }

  private toResolved(row: {
    calendarId: string;
    scope: string;
    externalEventId: string;
    activityId: string | null;
    activity: { name: string; weights: { categoryId: string; weightPercent: number }[] } | null;
    weights: { categoryId: string; weightPercent: number }[];
  }): ResolvedMapping {
    const source = row.activity ? row.activity.weights : row.weights;
    return {
      calendarId: row.calendarId,
      scope: row.scope as MappingScope,
      externalEventId: row.externalEventId,
      activityId: row.activityId,
      activityName: row.activity?.name ?? null,
      weights: source.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent })),
    };
  }
}
