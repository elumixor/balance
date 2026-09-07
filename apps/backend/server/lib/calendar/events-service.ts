import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { activities } from "~/db/schema";
import type { ActivityWeightInput } from "~/lib/categories/service";
import { NotFoundError } from "~/lib/http/api-error";
import { type IntegrationRecord, IntegrationRecordService } from "~/lib/integrations/records-service";
import { eventCache } from "./event-cache";
import { EventMappingService, type MappingPurpose, type ResolvedMapping } from "./mappings-service";
import { projectPrefs } from "./prefs-service";
import { calendarConnections } from "./registry";
import {
  type EventTimer,
  type ExternalEvent,
  type MappingScope,
  PRIMARY_CALENDAR_ID,
  type SelfResponse,
  type UpdateEventInput,
} from "./types";
import { resolveTarget, targetFor, visibleCalendarIds } from "./write-target";

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
  /** What the linked integration observed for this occurrence, in the feed's own shape. */
  readonly record: Record<string, unknown> | null;
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

export interface CreateEventOptions {
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
}

/** A series-scoped edit: which series, and where the occurrence being edited was before. */
export interface SeriesEdit {
  readonly seriesId: string;
  readonly previousStart: Date;
  readonly previousEnd: Date;
}

/** The one place the app reads calendar events — the week grid and the balance screen both. */
export class CalendarEventsService {
  readonly #mappings: EventMappingService;

  constructor(private readonly userId: string) {
    this.#mappings = new EventMappingService(userId);
  }

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

    const [perAccount, mappings, records] = await Promise.all([
      Promise.all(
        active.map(async (connection) => {
          const perCalendar = await Promise.all(
            visibleCalendarIds(connection).map((calendarId) =>
              eventCache.fetch(this.userId, `${connection.accountId}:${calendarId}`, from, to, () =>
                connection.provider.listEvents([calendarId], from, to),
              ),
            ),
          );
          return perCalendar.flat().map((event) => ({ event, accountId: connection.accountId }));
        }),
      ),
      this.#mappings.all(),
      new IntegrationRecordService(this.userId).all(),
    ]);

    const tagged = perAccount.flat();
    const prefs = projectPrefs(connections);
    return {
      connected: true,
      needsReconnect: prefs.needsReconnect,
      writeCalendarId: prefs.writeCalendarId,
      events: attachMappings(
        tagged.map((t) => t.event),
        mappings,
        records,
      ).map((event, i) => ({ ...event, accountId: tagged[i].accountId })),
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
  async create(input: CreateEventOptions): Promise<ResolvedEvent> {
    const { connection, calendarId } = await resolveTarget(this.userId, input.calendarId);
    const activity = input.activityId
      ? await db.query.activities.findFirst({
          where: and(eq(activities.id, input.activityId), eq(activities.userId, this.userId)),
          with: { weights: true },
        })
      : undefined;
    if (input.activityId && !activity) throw new NotFoundError("That activity no longer exists");

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

    const weights = input.weights?.length ? input.weights : undefined;
    if (!activity && !weights) {
      eventCache.invalidate(this.userId);
      return { ...attachMappings([{ ...created, calendarId }], [])[0], accountId: connection.accountId };
    }

    // The mapping write is what forgets the cached week — see `EventMappingService`.
    const mapping = await this.#mappings.upsert({
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
    return { ...attachMappings([{ ...created, calendarId }], [mapping])[0], accountId: connection.accountId };
  }

  /** One event by id, with what it counts as — for a timer pointed at something already planned. */
  async get(qualifiedCalendarId: string, eventId: string): Promise<ResolvedEvent> {
    const { connection, calendarId } = await targetFor(this.userId, qualifiedCalendarId);
    const [found, mappings] = await Promise.all([
      connection.provider.getEvent(calendarId, eventId),
      this.#mappings.all(),
    ]);
    return { ...attachMappings([{ ...found, calendarId }], mappings)[0], accountId: connection.accountId };
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
    series?: SeriesEdit,
  ): Promise<ResolvedEvent> {
    const { connection, calendarId } = await targetFor(this.userId, qualifiedCalendarId);
    const targetId = series ? series.seriesId : eventId;
    const targetPatch = series ? await this.#seriesPatch(connection.provider, calendarId, patch, series) : patch;

    const updated = await connection.provider.updateEvent(calendarId, targetId, targetPatch);
    if (targetPatch.recurrence !== undefined) {
      // The event keeps its id across the change but is now the master of a series, or a one-off
      // again — and its mapping has to say which, or the occurrences count as nothing.
      const repeats = targetPatch.recurrence.length > 0;
      await this.#mappings.rescope(
        { calendarId, scope: repeats ? "instance" : "series", externalEventId: targetId },
        repeats ? "series" : "instance",
      );
    }
    eventCache.invalidate(this.userId);
    const mappings = await this.#mappings.all();
    return { ...attachMappings([updated], mappings)[0], accountId: connection.accountId };
  }

  async #seriesPatch(
    provider: { getEvent(calendarId: string, eventId: string): Promise<ExternalEvent> },
    calendarId: string,
    patch: UpdateEventInput,
    series: SeriesEdit,
  ): Promise<UpdateEventInput> {
    const { start, end, ...rest } = patch;
    const moved =
      start &&
      end &&
      (start.getTime() !== series.previousStart.getTime() || end.getTime() !== series.previousEnd.getTime());
    // The occurrence's own times would land on the master as its times — they're only a delta.
    if (!moved) return rest;
    const master = await provider.getEvent(calendarId, series.seriesId);
    return {
      ...rest,
      start: new Date(master.start.getTime() + start.getTime() - series.previousStart.getTime()),
      end: new Date(master.end.getTime() + end.getTime() - series.previousEnd.getTime()),
    };
  }

  /**
   * Answering an invitation. Yes or no changes what the hour counts as — a declined event moves
   * no category's total — so the cache goes with it and the week is asked again.
   */
  async respond(qualifiedCalendarId: string, eventId: string, response: SelfResponse): Promise<ResolvedEvent> {
    const { connection, calendarId } = await targetFor(this.userId, qualifiedCalendarId);
    const updated = await connection.provider.respondToEvent(calendarId, eventId, response);
    eventCache.invalidate(this.userId);
    const mappings = await this.#mappings.all();
    return { ...attachMappings([updated], mappings)[0], accountId: connection.accountId };
  }

  async delete(qualifiedCalendarId: string, eventId: string): Promise<void> {
    const { connection, calendarId } = await targetFor(this.userId, qualifiedCalendarId);
    await connection.provider.deleteEvent(calendarId, eventId);
    // The mapping's removal forgets the cached week — see `EventMappingService`.
    await this.#mappings.remove({ calendarId, scope: "instance", externalEventId: eventId });
  }
}

/** A series mapping always wins over an instance mapping on one of its occurrences — category
 *  changes on a repeating event are meant to apply to every occurrence, not just one. */
function attachMappings(
  events: ExternalEvent[],
  mappings: readonly ResolvedMapping[],
  records: readonly IntegrationRecord[] = [],
): Omit<ResolvedEvent, "accountId">[] {
  const byKey = new Map(mappings.map((m) => [`${m.calendarId}|${m.scope}|${m.externalEventId}`, m]));
  const recordByKey = new Map(records.map((r) => [`${r.calendarId}|${r.source}|${r.externalEventId}`, r]));

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
            hidden: mapping.hidden,
            placeChange: mapping.placeChange,
          }
        : null,
      weights: mapping?.weights ?? [],
      // A record only means something under the feed that made it: unlinking a series orphans
      // its records rather than showing them on an event that no longer claims them.
      record: mapping?.source
        ? (recordByKey.get(`${event.calendarId}|${mapping.source}|${event.id}`)?.data ?? null)
        : null,
      countsTowardHours: !event.allDay && event.selfResponse !== "declined" && event.status !== "cancelled",
    };
  });
}
