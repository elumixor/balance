import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { activities } from "../../db/schema";
import { ApiError } from "../api-error";
import type { ActivityWeightInput } from "../categories-service";
import { ProviderNotConnectedError } from "./errors";
import { eventCache } from "./event-cache";
import { EventMappingService, type MappingPurpose, type ResolvedMapping } from "./mappings-service";
import { type CalendarConnection, calendarConnections } from "./registry";
import {
  type EventTimer,
  type ExternalEvent,
  type MappingScope,
  PRIMARY_CALENDAR_ID,
  type SelfResponse,
  type UpdateEventInput,
} from "./types";

export interface ResolvedEvent extends ExternalEvent {
  readonly mapping:
    | ({
        readonly scope: MappingScope;
        readonly activityId: string | null;
        readonly activityName: string | null;
      } & MappingPurpose)
    | null;
  /** Empty when the event counts as nothing. Otherwise sums to 100, buffer remainder included. */
  readonly weights: ActivityWeightInput[];
  /**
   * All-day events would each claim 24 hours, and an invitation you declined is time you didn't
   * spend — both are still drawn and still mappable, they just don't move any category's total.
   */
  readonly countsTowardHours: boolean;
  /** Which connected account this event's calendar belongs to — see `qualifyCalendarId`. */
  readonly accountId: string;
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

/**
 * A calendar id only means something alongside the account it came from — two connected Google
 * accounts each have their own "primary" — so every id that crosses the API boundary is qualified
 * with the account's own id. Nothing on this side of the boundary (the cache, event mappings, the
 * Google API calls themselves) ever sees a qualified id; Google's own ids are already globally
 * unique, so mappings stay keyed on the raw id alone.
 */
export function qualifyCalendarId(accountId: string, calendarId: string): string {
  return `${accountId}::${calendarId}`;
}

export function splitCalendarId(qualified: string): { accountId: string; calendarId: string } {
  const at = qualified.indexOf("::");
  if (at === -1) throw new ApiError("That calendar isn't in your account", 400);
  return { accountId: qualified.slice(0, at), calendarId: qualified.slice(at + 2) };
}

/** The one place the app reads calendar events — the week grid and the balance screen both. */
export class CalendarEventsService {
  constructor(private readonly userId: string) {}

  /**
   * Never throws for "no calendar connected" or "every grant died": both are states the screens
   * render, not errors. Anything Google actually refuses still throws. A revoked account among
   * otherwise-working ones is skipped rather than failing the whole read.
   */
  async resolve(from: Date, to: Date): Promise<ResolvedCalendarRange> {
    const connections = await calendarConnections(this.userId);
    if (connections.length === 0) return DISCONNECTED;

    const active = connections.filter((c) => !c.account.revokedAt);
    if (active.length === 0) return { ...DISCONNECTED, needsReconnect: true };

    const [perAccount, mappings] = await Promise.all([
      Promise.all(
        active.map(async (connection) => {
          const calendarIds = this.visibleCalendarIds(connection);
          const perCalendar = await Promise.all(
            calendarIds.map((calendarId) =>
              eventCache.fetch(this.userId, `${connection.accountId}:${calendarId}`, from, to, () =>
                connection.provider.listEvents([calendarId], from, to),
              ),
            ),
          );
          return perCalendar.flat().map((event) => ({ event, accountId: connection.accountId }));
        }),
      ),
      new EventMappingService(this.userId).all(),
    ]);

    const tagged = perAccount.flat();
    const resolved = this.attachMappings(
      tagged.map((t) => t.event),
      mappings,
    ).map((event, i) => ({ ...event, accountId: tagged[i].accountId }));

    return {
      connected: true,
      needsReconnect: connections.some((c) => c.account.revokedAt),
      writeCalendarId: this.writeTarget(active),
      events: resolved,
    };
  }

  /**
   * Dropping an activity onto the grid makes a real event in the user's calendar, and maps it in
   * the same breath. Google first: a mapping that fails leaves a visible uncategorised event,
   * where the other order would leave a mapping pointing at nothing.
   *
   * The activity is optional because undoing a delete has to put back events that counted as
   * nothing, or as a split of categories the caller re-applies itself; those come with a title.
   * A block dragged in from a project carries its sphere as weights and the project as purpose.
   */
  async create(input: {
    activityId?: string;
    weights?: ActivityWeightInput[];
    projectId?: string;
    practiceId?: string;
    taskId?: string;
    timer?: EventTimer | null;
    /** The integration writing it, so a later pass can tell its own events from everyone else's. */
    source?: string;
    start: Date;
    end: Date;
    calendarId?: string;
    title?: string;
    description?: string;
    location?: string;
    allDay?: boolean;
  }): Promise<ResolvedEvent> {
    const { connection, calendarId } = await this.resolveTarget(input.calendarId);
    const activity = input.activityId
      ? await db.query.activities.findFirst({
          where: and(eq(activities.id, input.activityId), eq(activities.userId, this.userId)),
          with: { weights: true },
        })
      : undefined;
    if (input.activityId && !activity) throw new ApiError("That activity no longer exists", 404);

    // An event tapped onto the grid is named after the fact, so an untitled one is a real state
    // rather than a mistake — the calendar shows it the way Google does, as no title at all.
    const title = input.title ?? activity?.name ?? "";

    const created = await connection.provider.createEvent({
      calendarId,
      title,
      description: input.description,
      location: input.location,
      start: input.start,
      end: input.end,
      allDay: input.allDay,
    });
    eventCache.invalidate(this.userId);

    const weights = input.weights?.length ? input.weights : undefined;
    if (!activity && !weights) {
      return { ...this.attachMappings([{ ...created, calendarId }], [])[0], accountId: connection.accountId };
    }

    const mapping = await new EventMappingService(this.userId).upsert({
      calendarId,
      scope: "instance",
      externalEventId: created.id,
      activityId: activity?.id ?? null,
      weights: activity ? undefined : weights,
      projectId: input.projectId ?? null,
      practiceId: input.practiceId ?? null,
      taskId: input.taskId ?? null,
      timer: input.timer ?? null,
      source: input.source ?? null,
    });
    return {
      ...this.attachMappings([{ ...created, calendarId }], [mapping])[0],
      accountId: connection.accountId,
    };
  }

  /** One event by id, with what it counts as — for a timer pointed at something already planned. */
  async get(qualifiedCalendarId: string, eventId: string): Promise<ResolvedEvent> {
    const { connection, calendarId } = await this.targetFor(qualifiedCalendarId);
    const [found, mappings] = await Promise.all([
      connection.provider.getEvent(calendarId, eventId),
      new EventMappingService(this.userId).all(),
    ]);
    return { ...this.attachMappings([{ ...found, calendarId }], mappings)[0], accountId: connection.accountId };
  }

  /**
   * A series-scoped write lands on the master event instead of the occurrence: title and notes
   * copy straight across, but a time change has to become a delta first — the master's own start
   * isn't the occurrence's start, so shifting every occurrence by the same amount means moving the
   * master by however far this one just moved, not to where this one landed.
   */
  async update(
    qualifiedCalendarId: string,
    eventId: string,
    patch: UpdateEventInput,
    series?: { seriesId: string; previousStart: Date; previousEnd: Date },
  ): Promise<ResolvedEvent> {
    const { connection, calendarId } = await this.targetFor(qualifiedCalendarId);
    let targetId = eventId;
    let targetPatch = patch;

    if (series) {
      targetId = series.seriesId;
      if (patch.start && patch.end) {
        const master = await connection.provider.getEvent(calendarId, series.seriesId);
        const deltaStart = patch.start.getTime() - series.previousStart.getTime();
        const deltaEnd = patch.end.getTime() - series.previousEnd.getTime();
        targetPatch = {
          ...patch,
          start: new Date(master.start.getTime() + deltaStart),
          end: new Date(master.end.getTime() + deltaEnd),
        };
      }
    }

    const updated = await connection.provider.updateEvent(calendarId, targetId, targetPatch);
    eventCache.invalidate(this.userId);
    const mappings = await new EventMappingService(this.userId).all();
    return { ...this.attachMappings([updated], mappings)[0], accountId: connection.accountId };
  }

  /**
   * Answering an invitation. Yes or no changes what the hour counts as — a declined event moves
   * no category's total — so the cache goes with it and the week is asked again.
   */
  async respond(qualifiedCalendarId: string, eventId: string, response: SelfResponse): Promise<ResolvedEvent> {
    const { connection, calendarId } = await this.targetFor(qualifiedCalendarId);
    const updated = await connection.provider.respondToEvent(calendarId, eventId, response);
    eventCache.invalidate(this.userId);
    const mappings = await new EventMappingService(this.userId).all();
    return { ...this.attachMappings([updated], mappings)[0], accountId: connection.accountId };
  }

  async delete(qualifiedCalendarId: string, eventId: string): Promise<void> {
    const { connection, calendarId } = await this.targetFor(qualifiedCalendarId);
    await connection.provider.deleteEvent(calendarId, eventId);
    eventCache.invalidate(this.userId);
    await new EventMappingService(this.userId).remove({ calendarId, scope: "instance", externalEventId: eventId });
  }

  /** Resolves a qualified calendar id to the account that owns it — for an update or a delete. */
  private async targetFor(
    qualifiedCalendarId: string,
  ): Promise<{ connection: CalendarConnection; calendarId: string }> {
    const { accountId, calendarId } = splitCalendarId(qualifiedCalendarId);
    const connections = await calendarConnections(this.userId);
    const connection = connections.find((c) => c.accountId === accountId && !c.account.revokedAt);
    if (!connection) throw new ProviderNotConnectedError("google");
    return { connection, calendarId };
  }

  /** Same idea for a create, except there may be no calendar id yet — the write target stands in. */
  private async resolveTarget(
    qualifiedCalendarId?: string,
  ): Promise<{ connection: CalendarConnection; calendarId: string }> {
    if (qualifiedCalendarId) return this.targetFor(qualifiedCalendarId);

    const connections = await calendarConnections(this.userId);
    const active = connections.filter((c) => !c.account.revokedAt);
    if (active.length === 0) throw new ProviderNotConnectedError("google");

    const withWrite = active.find((c) => c.account.writeCalendarId);
    if (withWrite)
      return { connection: withWrite, calendarId: withWrite.account.writeCalendarId ?? PRIMARY_CALENDAR_ID };
    return { connection: active[0], calendarId: PRIMARY_CALENDAR_ID };
  }

  private writeTarget(active: readonly CalendarConnection[]): string {
    const withWrite = active.find((c) => c.account.writeCalendarId);
    if (withWrite)
      return qualifyCalendarId(withWrite.accountId, withWrite.account.writeCalendarId ?? PRIMARY_CALENDAR_ID);
    const fallback = active[0];
    return fallback ? qualifyCalendarId(fallback.accountId, PRIMARY_CALENDAR_ID) : PRIMARY_CALENDAR_ID;
  }

  private visibleCalendarIds(connection: CalendarConnection): string[] {
    const chosen = connection.account.visibleCalendarIds;
    return chosen.length > 0 ? chosen : [PRIMARY_CALENDAR_ID];
  }

  /** A series mapping always wins over an instance mapping on one of its occurrences — category
   *  changes on a repeating event are meant to apply to every occurrence, not just one. */
  private attachMappings(
    events: ExternalEvent[],
    mappings: readonly ResolvedMapping[],
  ): Omit<ResolvedEvent, "accountId">[] {
    const byKey = new Map(mappings.map((m) => [`${m.calendarId}|${m.scope}|${m.externalEventId}`, m]));

    return events.map((event) => {
      const mapping =
        (event.seriesId ? byKey.get(`${event.calendarId}|series|${event.seriesId}`) : undefined) ??
        byKey.get(`${event.calendarId}|instance|${event.id}`);

      return {
        ...event,
        mapping: mapping
          ? {
              scope: mapping.scope,
              activityId: mapping.activityId,
              activityName: mapping.activityName,
              projectId: mapping.projectId,
              practiceId: mapping.practiceId,
              taskId: mapping.taskId,
              timer: mapping.timer,
              source: mapping.source,
            }
          : null,
        weights: mapping?.weights ?? [],
        countsTowardHours: !event.allDay && event.selfResponse !== "declined" && event.status !== "cancelled",
      };
    });
  }
}
