import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { activities } from "~/db/schema";
import type { ActivityWeightInput } from "~/lib/categories/service";
import { NotFoundError } from "~/lib/http/api-error";
import { type IntegrationRecord, IntegrationRecordService } from "~/lib/integrations/records-service";
import { ZoomService } from "~/lib/zoom/service";
import { eventCache } from "./event-cache";
import { EventMappingService, type MappingPurpose, type ResolvedMapping } from "./mappings-service";
import { projectPrefs } from "./prefs-service";
import { calendarConnections } from "./registry";
import { isSeriesStart, remainingRule, splitPointOf, truncateRule } from "./series-split";
import {
  type AttendeeInput,
  type CalendarProvider,
  type ConferenceInput,
  type EventTimer,
  type ExternalEvent,
  type MappingScope,
  PRIMARY_CALENDAR_ID,
  type ProviderConference,
  type SelfResponse,
  type SeriesScope,
  type UpdateEventInput,
} from "./types";
import { resolveTarget, targetFor, visibleCalendarIds, type WriteTarget } from "./write-target";

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
  practiceId?: string;
  urn?: string;
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
  /** Who else is coming. Naming anyone here sends them the invitation as the event is written. */
  attendees?: readonly AttendeeInput[];
  /** `"create"` gives the new event a Meet link of its own. */
  conference?: ConferenceInput;
}

/**
 * An edit as a screen makes it: everything the calendar takes, plus `conference: "zoom"`, which
 * is a room to be made rather than something a calendar can be asked for.
 */
export type EventUpdate = Omit<UpdateEventInput, "conference"> & { readonly conference?: ConferenceInput };

/** What a Zoom room is booked against: the meeting it is for, as the write will leave it. */
interface ZoomTimes {
  readonly title: string;
  readonly start: Date;
  readonly end: Date;
  readonly timeZone: string | undefined;
}

/**
 * A series-scoped edit: which series, how far along it the change reaches, and where the
 * occurrence being edited was before.
 */
export interface SeriesEdit {
  readonly seriesId: string;
  readonly scope: SeriesScope;
  readonly previousStart: Date;
  readonly previousEnd: Date;
}

/** A series-scoped delete: which series, how far along it, and where the occurrence stands. */
export interface SeriesDelete {
  readonly seriesId: string;
  readonly scope: SeriesScope;
  readonly occurrenceStart: Date;
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

    // A calendar shared into more than one connected account surfaces the same event under
    // each — same id, same time — so the id alone is not unique across accounts; the pair is.
    const seen = new Set<string>();
    const tagged = perAccount.flat().filter((t) => {
      const key = `${t.event.calendarId}|${t.event.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
      attendees: input.attendees,
      conference: await this.#resolveConference(input.conference, () => ({
        title,
        start: input.start,
        end: input.end,
        timeZone: undefined,
      })),
    });

    const weights = input.weights?.length ? input.weights : undefined;
    if (!activity && !weights && !input.urn) {
      eventCache.invalidate(this.userId);
      return { ...attachMappings([{ ...created, calendarId }], [])[0], accountId: connection.accountId };
    }

    const key = { calendarId, scope: "instance" as const, externalEventId: created.id };
    const purpose = {
      practiceId: input.practiceId ?? null,
      urn: input.urn ?? null,
      timer: input.timer ?? null,
      source: input.source ?? null,
    };
    // The mapping write is what forgets the cached week — see `EventMappingService`. A block that
    // only names the work it is for counts as nothing yet, which `annotate` files as buffer time.
    const mapping =
      activity || weights
        ? await this.#mappings.upsert({
            ...key,
            ...purpose,
            activityId: activity?.id ?? null,
            weights: activity ? undefined : weights,
          })
        : await this.#mappings.annotate(key, purpose);
    return { ...attachMappings([{ ...created, calendarId }], [mapping])[0], accountId: connection.accountId };
  }

  /**
   * `"zoom"` is not something a calendar can be asked for: Google mints its own call and nothing
   * else. A room is made in the connected Zoom account first, and what reaches the calendar is
   * the link it answered with — which is the same shape as a link somebody pasted.
   */
  async #resolveConference(
    conference: ConferenceInput | undefined,
    meeting: () => Promise<ZoomTimes> | ZoomTimes,
  ): Promise<ProviderConference | undefined> {
    if (conference !== "zoom") return conference;
    const { title, start, end, timeZone } = await meeting();
    const room = await new ZoomService(this.userId).createMeeting({
      topic: title,
      start,
      minutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000)),
      timeZone,
    });
    return {
      url: room.joinUrl,
      name: "Zoom Meeting",
      meetingCode: room.meetingCode,
      ...(room.passcode ? { notes: `Passcode: ${room.passcode}` } : {}),
    };
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
   *
   * "This and following" is a different shape: the series is cut in two just before this
   * occurrence, and what's left of it starts over as a new series with the change applied — the
   * calendar has no way to say "from here on" inside one rule.
   */
  async update(
    qualifiedCalendarId: string,
    eventId: string,
    patch: EventUpdate,
    series?: SeriesEdit,
  ): Promise<ResolvedEvent> {
    const { connection, calendarId } = await targetFor(this.userId, qualifiedCalendarId);
    if (series?.scope === "following") {
      const split = await this.#split(connection.provider, calendarId, eventId, series.seriesId, series.previousStart);
      if (split) {
        const { master, recurrence } = split;
        const created = await connection.provider.createEvent({
          calendarId,
          title: patch.title ?? master.title,
          description: patch.description ?? master.description ?? undefined,
          location: patch.location ?? master.location ?? undefined,
          start: patch.start ?? series.previousStart,
          end: patch.end ?? series.previousEnd,
          allDay: master.allDay,
          timeZone: patch.timeZone ?? master.timeZone ?? undefined,
          recurrence: patch.recurrence ?? recurrence,
          reminders: patch.reminders ?? master.reminders,
          attendees: patch.attendees ?? guestsOf(master),
        });
        await this.#mappings.copy({ calendarId, scope: "series", externalEventId: series.seriesId }, created.id);
        await this.#collapse(connection.provider, calendarId, series.seriesId);
        await this.#collapse(connection.provider, calendarId, created.id);
        eventCache.invalidate(this.userId);
        const mappings = await this.#mappings.all();
        return { ...attachMappings([{ ...created, calendarId }], mappings)[0], accountId: connection.accountId };
      }
    }
    const targetId = series ? series.seriesId : eventId;
    const targetPatch = series ? await this.#seriesPatch(connection.provider, calendarId, patch, series) : patch;
    // A room is booked for the meeting it is for, so an edit that asks for one and says nothing
    // else reads the event first rather than inventing a time to book.
    const conference = await this.#resolveConference(targetPatch.conference, async () => {
      const current = await connection.provider.getEvent(calendarId, targetId);
      return {
        title: targetPatch.title ?? current.title,
        start: targetPatch.start ?? current.start,
        end: targetPatch.end ?? current.end,
        timeZone: targetPatch.timeZone ?? current.timeZone ?? undefined,
      };
    });

    const updated = await connection.provider.updateEvent(calendarId, targetId, { ...targetPatch, conference });
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
    patch: EventUpdate,
    series: SeriesEdit,
  ): Promise<EventUpdate> {
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

  /**
   * Hands the event to another calendar, which is what changing its organizer means: the new
   * calendar's account becomes the host, and every guest sees the invitation coming from it.
   *
   * Inside one account Google does it in one call, keeping the event's id, its guests and their
   * answers. Between two accounts nothing can: neither side can write the other's calendar, so
   * the event is written again on the far side and taken off the near one. That copy is a new
   * event — a new id, guests asked again, and whatever a device observed against the old
   * occurrence left behind — which is why it is only reached for when the accounts differ.
   *
   * An occurrence can't go alone: a series lives on its master, so the master is what moves.
   */
  async move(qualifiedCalendarId: string, eventId: string, destination: string, seriesId?: string) {
    const from = await targetFor(this.userId, qualifiedCalendarId);
    const to = await targetFor(this.userId, destination);
    const sameAccount = from.connection.accountId === to.connection.accountId;
    const targetId = seriesId ?? eventId;
    if (sameAccount && from.calendarId === to.calendarId) return this.get(qualifiedCalendarId, eventId);

    const moved = sameAccount
      ? await from.connection.provider.moveEvent(from.calendarId, targetId, to.calendarId)
      : await this.#handOver(from, to, targetId);

    await this.#mappings.relocateEvent(
      { calendarId: from.calendarId, eventId: targetId },
      { calendarId: to.calendarId, eventId: moved.id },
    );
    eventCache.invalidate(this.userId);
    const mappings = await this.#mappings.all();
    return { ...attachMappings([moved], mappings)[0], accountId: to.connection.accountId };
  }

  /** The cross-account half of a move: written on the far side, then taken off the near one. */
  async #handOver(from: WriteTarget, to: WriteTarget, eventId: string): Promise<ExternalEvent> {
    const source = await from.connection.provider.getEvent(from.calendarId, eventId);
    const created = await to.connection.provider.createEvent({
      calendarId: to.calendarId,
      title: source.title,
      description: source.description ?? undefined,
      location: source.location ?? undefined,
      start: source.start,
      end: source.end,
      allDay: source.allDay,
      timeZone: source.timeZone ?? undefined,
      recurrence: source.recurrence ?? undefined,
      reminders: source.reminders,
      attendees: guestsOf(source),
    });
    // A Meet link belongs to the calendar that made it, so the copy is given one of its own.
    const withCall = source.conferenceUrl
      ? await to.connection.provider.updateEvent(to.calendarId, created.id, { conference: "create" })
      : created;
    await from.connection.provider.deleteEvent(from.calendarId, eventId);
    return withCall;
  }

  /**
   * One occurrence, the whole series, or this occurrence and every one after it — the last being
   * the master's rule told to end just before this one, which is all "following" means here.
   */
  async delete(
    qualifiedCalendarId: string,
    eventId: string,
    series?: SeriesDelete,
    /** The series a lone occurrence is taken out of, so what is left can be checked. */
    occurrenceOf?: string,
  ): Promise<void> {
    const { connection, calendarId } = await targetFor(this.userId, qualifiedCalendarId);
    const following =
      series?.scope === "following"
        ? await this.#split(connection.provider, calendarId, eventId, series.seriesId, series.occurrenceStart)
        : null;
    if (series && !following) {
      await connection.provider.deleteEvent(calendarId, series.seriesId);
      await this.#mappings.remove({ calendarId, scope: "series", externalEventId: series.seriesId });
    } else if (!series) {
      await connection.provider.deleteEvent(calendarId, eventId);
    }
    // The mapping's removal forgets the cached week — see `EventMappingService`.
    await this.#mappings.remove({ calendarId, scope: "instance", externalEventId: eventId });
    const shrunk = following ? series?.seriesId : !series ? occurrenceOf : undefined;
    if (shrunk) await this.#collapse(connection.provider, calendarId, shrunk);
    eventCache.invalidate(this.userId);
  }

  /**
   * Ends the series just before this occurrence, and answers with the rule the rest of it would
   * repeat by. Null when the occurrence is the series' first: nothing would be left before it,
   * so the change is the whole series' and the caller treats it that way. What stays behind is
   * then checked for still being a series at all — see `collapse`.
   */
  async #split(
    provider: CalendarProvider,
    calendarId: string,
    occurrenceId: string,
    seriesId: string,
    seen: Date,
  ): Promise<{ master: ExternalEvent; recurrence: string[] } | null> {
    const master = await provider.getEvent(calendarId, seriesId);
    const point = splitPointOf(occurrenceId, seen);
    if (!master.recurrence || isSeriesStart(point, master.start)) return null;
    const cut = point.kind === "instant" ? point.at : seen;
    // Only a rule that counts its occurrences needs to know how many have already happened.
    const counted = master.recurrence.some((line) => line.startsWith("RRULE:") && line.includes("COUNT="));
    const elapsed = counted
      ? (await provider.listEvents([calendarId], master.start, cut)).filter(
          (event) => event.seriesId === seriesId && event.start.getTime() < cut.getTime(),
        ).length
      : 0;
    await provider.updateEvent(calendarId, seriesId, { recurrence: truncateRule(master.recurrence, point) });
    return { master, recurrence: remainingRule(master.recurrence, elapsed) };
  }

  /**
   * A series with one occurrence left is a one-off wearing a rule: every card would keep asking
   * "how much of the series?" about it. Whenever a series shrinks — cut in two, one occurrence
   * deleted — whatever is left is checked, and a lone occurrence is made a plain event, its
   * mapping following it down to the instance.
   */
  async #collapse(provider: CalendarProvider, calendarId: string, seriesId: string): Promise<void> {
    if ((await provider.countInstances(calendarId, seriesId, 2)) >= 2) return;
    await provider.updateEvent(calendarId, seriesId, { recurrence: [] });
    await this.#mappings.rescope({ calendarId, scope: "series", externalEventId: seriesId }, "instance");
  }
}

/** The guest list as a create takes it: everyone with an address, the organizer included. */
function guestsOf(master: ExternalEvent) {
  const guests = master.attendees.flatMap((a) => (a.email ? [{ email: a.email, optional: a.optional }] : []));
  return guests.length > 0 ? guests : undefined;
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
            practiceId: mapping.practiceId,
            urn: mapping.urn,
            timer: mapping.timer,
            source: mapping.source,
            hidden: mapping.hidden,
            endLocation: mapping.endLocation,
            notes: mapping.notes,
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
