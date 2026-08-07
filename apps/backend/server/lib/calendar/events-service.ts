import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { activities } from "../../db/schema";
import { ApiError } from "../api-error";
import type { ActivityWeightInput } from "../categories-service";
import { ProviderNotConnectedError } from "./errors";
import { eventCache } from "./event-cache";
import { EventMappingService, type ResolvedMapping } from "./mappings-service";
import { type CalendarConnection, calendarConnection } from "./registry";
import { type ExternalEvent, type MappingScope, PRIMARY_CALENDAR_ID, type UpdateEventInput } from "./types";

export interface ResolvedEvent extends ExternalEvent {
  readonly mapping: {
    readonly scope: MappingScope;
    readonly activityId: string | null;
    readonly activityName: string | null;
  } | null;
  /** Empty when the event counts as nothing. Otherwise sums to 100, buffer remainder included. */
  readonly weights: ActivityWeightInput[];
  /**
   * All-day events would each claim 24 hours, and an invitation you declined is time you didn't
   * spend — both are still drawn and still mappable, they just don't move any category's total.
   */
  readonly countsTowardHours: boolean;
}

export interface ResolvedCalendarRange {
  readonly connected: boolean;
  readonly needsReconnect: boolean;
  readonly writeCalendarId: string;
  readonly events: ResolvedEvent[];
}

const DISCONNECTED: ResolvedCalendarRange = {
  connected: false,
  needsReconnect: false,
  writeCalendarId: PRIMARY_CALENDAR_ID,
  events: [],
};

/** The one place the app reads calendar events — the week grid and the balance screen both. */
export class CalendarEventsService {
  constructor(private readonly userId: string) {}

  /**
   * Never throws for "no calendar connected" or "the grant died": both are states the screens
   * render, not errors. Anything Google actually refuses still throws.
   */
  async resolve(from: Date, to: Date): Promise<ResolvedCalendarRange> {
    const connection = await calendarConnection(this.userId);
    if (!connection) return DISCONNECTED;
    if (connection.account.revokedAt) return { ...DISCONNECTED, needsReconnect: true };

    const calendarIds = this.visibleCalendarIds(connection);
    const [events, mappings] = await Promise.all([
      Promise.all(
        calendarIds.map((calendarId) =>
          eventCache.fetch(this.userId, calendarId, from, to, () =>
            connection.provider.listEvents([calendarId], from, to),
          ),
        ),
      ),
      new EventMappingService(this.userId).all(),
    ]);

    return {
      connected: true,
      needsReconnect: false,
      writeCalendarId: connection.account.writeCalendarId ?? PRIMARY_CALENDAR_ID,
      events: this.attachMappings(events.flat(), mappings),
    };
  }

  /**
   * Dropping an activity onto the grid makes a real event in the user's calendar, and maps it in
   * the same breath. Google first: a mapping that fails leaves a visible uncategorised event,
   * where the other order would leave a mapping pointing at nothing.
   */
  async createFromActivity(input: {
    activityId: string;
    start: Date;
    end: Date;
    calendarId?: string;
    title?: string;
  }): Promise<ResolvedEvent> {
    const connection = await this.connected();
    const activity = await db.query.activities.findFirst({
      where: and(eq(activities.id, input.activityId), eq(activities.userId, this.userId)),
      with: { weights: true },
    });
    if (!activity) throw new ApiError("That activity no longer exists", 404);

    const calendarId = input.calendarId ?? connection.account.writeCalendarId ?? PRIMARY_CALENDAR_ID;
    const created = await connection.provider.createEvent({
      calendarId,
      title: input.title ?? activity.name,
      start: input.start,
      end: input.end,
    });
    eventCache.invalidate(this.userId);

    const mapping = await new EventMappingService(this.userId).upsert({
      calendarId,
      scope: "instance",
      externalEventId: created.id,
      activityId: activity.id,
    });
    return this.attachMappings([{ ...created, calendarId }], [mapping])[0];
  }

  async update(calendarId: string, eventId: string, patch: UpdateEventInput): Promise<ResolvedEvent> {
    const connection = await this.connected();
    const updated = await connection.provider.updateEvent(calendarId, eventId, patch);
    eventCache.invalidate(this.userId);
    const mappings = await new EventMappingService(this.userId).all();
    return this.attachMappings([updated], mappings)[0];
  }

  async delete(calendarId: string, eventId: string): Promise<void> {
    const connection = await this.connected();
    await connection.provider.deleteEvent(calendarId, eventId);
    eventCache.invalidate(this.userId);
    await new EventMappingService(this.userId).remove({ calendarId, scope: "instance", externalEventId: eventId });
  }

  private async connected(): Promise<CalendarConnection> {
    const connection = await calendarConnection(this.userId);
    if (!connection) throw new ProviderNotConnectedError("google");
    return connection;
  }

  private visibleCalendarIds(connection: CalendarConnection): string[] {
    const chosen = connection.account.visibleCalendarIds;
    return chosen.length > 0 ? chosen : [PRIMARY_CALENDAR_ID];
  }

  /** An instance mapping always wins over the series mapping it sits inside. */
  private attachMappings(events: ExternalEvent[], mappings: readonly ResolvedMapping[]): ResolvedEvent[] {
    const byKey = new Map(mappings.map((m) => [`${m.calendarId}|${m.scope}|${m.externalEventId}`, m]));

    return events.map((event) => {
      const mapping =
        byKey.get(`${event.calendarId}|instance|${event.id}`) ??
        (event.seriesId ? byKey.get(`${event.calendarId}|series|${event.seriesId}`) : undefined);

      return {
        ...event,
        mapping: mapping
          ? { scope: mapping.scope, activityId: mapping.activityId, activityName: mapping.activityName }
          : null,
        weights: mapping?.weights ?? [],
        countsTowardHours: !event.allDay && event.selfResponse !== "declined" && event.status !== "cancelled",
      };
    });
  }
}
