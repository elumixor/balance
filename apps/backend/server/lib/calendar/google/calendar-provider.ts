import type { ProviderAccountService } from "~/lib/calendar/provider-accounts";
import type {
  CalendarProvider,
  CalendarRef,
  CreateEventInput,
  ExternalEvent,
  ExternalPerson,
  SelfResponse,
  UpdateEventInput,
} from "~/lib/calendar/types";
import { ConflictError } from "~/lib/http/api-error";
import type { GoogleAttendee, GoogleCalendarListEntry, GoogleEvent, GoogleEventsResponse } from "./api-types";
import { type CalendarContext, calendarDate, conferenceBlock, isReadOnlyRole, toExternalEvent } from "./mapper";
import { GooglePeople, hasContactsScope } from "./people";
import { GoogleRequest } from "./request";

const PAGE_SIZE = 250;

/** Google's own noise: neither belongs on a time grid, and both arrive as all-day events. */
const IGNORED_EVENT_TYPES = new Set(["workingLocation", "birthday"]);

/**
 * Everything the app reads off an event, asked for by name. Google returns the whole event
 * otherwise, and a week of them is a lot of JSON for fields nothing draws.
 */
const ITEM_FIELDS =
  "id,status,summary,description,location,start,end,recurringEventId,recurrence,eventType,guestsCanModify,htmlLink,hangoutLink," +
  "conferenceData(entryPoints(entryPointType,uri,label,meetingCode),conferenceSolution(name,key/type))," +
  "organizer(email,displayName,self),attendees(email,displayName,self,organizer,optional,resource,responseStatus)," +
  "reminders(useDefault,overrides(method,minutes))";
const EVENT_FIELDS = `nextPageToken,timeZone,accessRole,items(${ITEM_FIELDS})`;
const SINGLE_EVENT_FIELDS = ITEM_FIELDS;
const CALENDAR_LIST_FIELDS = "items(id,summary,summaryOverride,backgroundColor,primary,timeZone,accessRole)";

/** A guest list and the day it was on: everything a suggestion needs, and nothing a grid does. */
const PEOPLE_FIELDS =
  "nextPageToken,items(start(date,dateTime),organizer(email,displayName,self),attendees(email,displayName,self,resource))";
/** Enough of a history to know who somebody actually meets, without paging through a year of it. */
const PEOPLE_PAGES = 2;

const encode = encodeURIComponent;

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google";
  readonly #request: GoogleRequest;
  readonly #people: GooglePeople;
  readonly #scopes: string | null;
  /** One calendar's zone and role per provider instance: a write asks about it once, not per call. */
  readonly #calendars = new Map<string, Promise<CalendarContext>>();

  constructor(accounts: ProviderAccountService, accountId: string, scopes: string | null = null) {
    this.#request = new GoogleRequest(accounts, accountId, this.name);
    this.#people = new GooglePeople(accounts, accountId);
    this.#scopes = scopes;
  }

  async listCalendars(): Promise<CalendarRef[]> {
    const response = await this.#request.send<{ items: GoogleCalendarListEntry[] }>(
      `/users/me/calendarList?minAccessRole=reader&maxResults=${PAGE_SIZE}&fields=${CALENDAR_LIST_FIELDS}`,
    );
    return (response.items ?? []).map((c) => ({
      id: c.id,
      name: c.summaryOverride ?? c.summary,
      color: c.backgroundColor ?? null,
      primary: c.primary === true,
      timeZone: c.timeZone,
      readOnly: isReadOnlyRole(c.accessRole),
    }));
  }

  async listEvents(calendarIds: readonly string[], from: Date, to: Date): Promise<ExternalEvent[]> {
    const perCalendar = await Promise.all(calendarIds.map((id) => this.#listCalendarEvents(id, from, to)));
    return perCalendar.flat();
  }

  async createEvent(input: CreateEventInput): Promise<ExternalEvent> {
    const zone = input.timeZone === undefined ? {} : { timeZone: input.timeZone };
    // A guest list nobody is told about is a list of people who never heard about the meeting, so
    // a create that names guests asks Google to send the invitation the same way an edit does.
    const params = new URLSearchParams();
    if (input.attendees?.length) params.set("sendUpdates", "all");
    // Google takes a conference — one it makes, or one it is handed — only from a request that
    // says which version of that block it is sending.
    if (input.conference) params.set("conferenceDataVersion", "1");
    const query = params.size > 0 ? `?${params}` : "";
    const created = await this.#request.send<GoogleEvent>(`/calendars/${encode(input.calendarId)}/events${query}`, {
      method: "POST",
      body: {
        summary: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.location === undefined ? {} : { location: input.location }),
        ...(input.allDay
          ? { start: { date: calendarDate(input.start) }, end: { date: calendarDate(input.end) } }
          : {
              start: { dateTime: input.start.toISOString(), ...zone },
              end: { dateTime: input.end.toISOString(), ...zone },
            }),
        ...(input.recurrence === undefined ? {} : { recurrence: [...input.recurrence] }),
        ...(input.reminders === undefined
          ? {}
          : { reminders: { useDefault: false, overrides: input.reminders.map((r) => ({ ...r })) } }),
        ...(input.attendees === undefined
          ? {}
          : { attendees: input.attendees.map((a) => ({ email: a.email, optional: a.optional === true })) }),
        ...(input.conference === undefined || input.conference === "remove"
          ? {}
          : { conferenceData: conferenceBlock(input.conference) }),
      },
    });
    return toExternalEvent(created, await this.#calendar(input.calendarId));
  }

  /** The master event of a series, by its own id — used to shift a whole series by a delta. */
  async getEvent(calendarId: string, eventId: string): Promise<ExternalEvent> {
    const event = await this.#request.send<GoogleEvent>(
      `/calendars/${encode(calendarId)}/events/${encode(eventId)}?fields=${SINGLE_EVENT_FIELDS}`,
    );
    return toExternalEvent(event, await this.#calendar(calendarId));
  }

  /**
   * Only what the patch names. Google replaces a guest list rather than merging it, and answers
   * a conferencing request only when told which version of that block it is being sent, so both
   * are written whole; the others are one field each. Everyone invited hears about the change —
   * a meeting moved without telling its guests is a meeting nobody comes to.
   */
  async updateEvent(calendarId: string, eventId: string, patch: UpdateEventInput): Promise<ExternalEvent> {
    const zone = patch.timeZone === undefined ? {} : { timeZone: patch.timeZone };
    const params = new URLSearchParams({ sendUpdates: "all", fields: SINGLE_EVENT_FIELDS });
    if (patch.conference) params.set("conferenceDataVersion", "1");

    const updated = await this.#request.send<GoogleEvent>(
      `/calendars/${encode(calendarId)}/events/${encode(eventId)}?${params}`,
      {
        method: "PATCH",
        body: {
          ...(patch.title === undefined ? {} : { summary: patch.title }),
          ...(patch.description === undefined ? {} : { description: patch.description }),
          ...(patch.location === undefined ? {} : { location: patch.location }),
          ...(patch.start === undefined ? {} : { start: { dateTime: patch.start.toISOString(), ...zone } }),
          ...(patch.end === undefined ? {} : { end: { dateTime: patch.end.toISOString(), ...zone } }),
          ...(patch.recurrence === undefined ? {} : { recurrence: [...patch.recurrence] }),
          ...(patch.reminders === undefined
            ? {}
            : { reminders: { useDefault: false, overrides: patch.reminders.map((r) => ({ ...r })) } }),
          ...(patch.attendees === undefined ? {} : { attendees: await this.#guestList(calendarId, eventId, patch) }),
          ...(patch.conference === undefined ? {} : { conferenceData: conferenceBlock(patch.conference) }),
        },
      },
    );
    return toExternalEvent(updated, await this.#calendar(calendarId));
  }

  /**
   * Google's own word for changing an event's organizer: the event is handed to another calendar
   * of the same account, keeping its id, its guests and their answers. Only the account that owns
   * both calendars can do it, and an occurrence can't go alone — the master carries the series.
   */
  async moveEvent(calendarId: string, eventId: string, destinationCalendarId: string): Promise<ExternalEvent> {
    const params = new URLSearchParams({ destination: destinationCalendarId, sendUpdates: "all" });
    const moved = await this.#request.send<GoogleEvent>(
      `/calendars/${encode(calendarId)}/events/${encode(eventId)}/move?${params}`,
      { method: "POST" },
    );
    return toExternalEvent(moved, await this.#calendar(destinationCalendarId));
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.#request.send<void>(`/calendars/${encode(calendarId)}/events/${encode(eventId)}`, {
      method: "DELETE",
      allowGone: true,
    });
  }

  /**
   * Answering an invitation is a patch to your own line of the guest list — and Google replaces
   * the whole list rather than merging it, so the others have to be sent back untouched. The
   * event is read first for exactly that reason.
   */
  async respondToEvent(calendarId: string, eventId: string, response: SelfResponse): Promise<ExternalEvent> {
    const path = `/calendars/${encode(calendarId)}/events/${encode(eventId)}`;
    const current = await this.#request.send<GoogleEvent>(`${path}?fields=attendees(email,self,responseStatus)`);
    const attendees = current.attendees ?? [];
    if (!attendees.some((attendee) => attendee.self)) {
      throw new ConflictError("You're not on the guest list for that event");
    }

    const updated = await this.#request.send<GoogleEvent>(`${path}?sendUpdates=all&fields=${SINGLE_EVENT_FIELDS}`, {
      method: "PATCH",
      body: {
        attendees: attendees.map((attendee) => (attendee.self ? { ...attendee, responseStatus: response } : attendee)),
      },
    });
    return toExternalEvent(updated, await this.#calendar(calendarId));
  }

  /**
   * The list as it will be sent: whoever the patch names, keeping the answer anyone already on
   * it has given — replacing a guest with a fresh line would reset their reply to "not answered".
   */
  async #guestList(calendarId: string, eventId: string, patch: UpdateEventInput): Promise<GoogleAttendee[]> {
    const path = `/calendars/${encode(calendarId)}/events/${encode(eventId)}`;
    const current = await this.#request.send<GoogleEvent>(
      `${path}?fields=attendees(email,self,responseStatus,optional)`,
    );
    const known = new Map((current.attendees ?? []).map((a) => [a.email?.toLowerCase(), a]));
    return (patch.attendees ?? []).map((guest) => ({
      ...known.get(guest.email.toLowerCase()),
      email: guest.email,
      optional: guest.optional === true,
    }));
  }

  /**
   * A single event carries neither its calendar's zone nor the account's role on it, and both
   * shape the answer — where an all-day date lands, whether the event can be moved. A list read
   * gets them for free on the page; anything else asks the calendar list once.
   */
  #calendar(calendarId: string): Promise<CalendarContext> {
    let context = this.#calendars.get(calendarId);
    if (!context) {
      context = this.#request
        .send<GoogleCalendarListEntry>(`/users/me/calendarList/${encode(calendarId)}?fields=timeZone,accessRole`)
        .then((entry) => ({ id: calendarId, timeZone: entry.timeZone, readOnly: isReadOnlyRole(entry.accessRole) }));
      this.#calendars.set(calendarId, context);
    }
    return context;
  }

  /**
   * Two asks of the same window, side by side: the occurrences the grid draws (`singleEvents`
   * makes Google expand recurrence, so nothing downstream ever parses an RRULE), and the masters
   * they repeat from — expansion drops the rule from every occurrence, and a card opened on one
   * has to say how it repeats without a round trip of its own.
   */
  async #listCalendarEvents(calendarId: string, from: Date, to: Date): Promise<ExternalEvent[]> {
    const [pages, rules] = await Promise.all([
      this.#occurrences(calendarId, from, to),
      this.#rules(calendarId, from, to),
    ]);
    return pages.flatMap((page) => {
      const calendar: CalendarContext = {
        id: calendarId,
        timeZone: page.timeZone,
        readOnly: isReadOnlyRole(page.accessRole),
      };
      return (page.items ?? [])
        .filter((item) => !(item.eventType && IGNORED_EVENT_TYPES.has(item.eventType)))
        .map((item) => {
          const master = item.recurringEventId ? rules.get(item.recurringEventId) : undefined;
          if (!master) return toExternalEvent(item, calendar);
          const event = toExternalEvent({ ...item, recurrence: master.recurrence }, calendar);
          return { ...event, seriesStart: toExternalEvent(master, calendar).start };
        });
    });
  }

  /**
   * Google's own full-text search over a calendar, one page per calendar: a palette wants the
   * first handful of hits, not the year. Series are left as occurrences with no rule attached —
   * a search result is something to jump to, and the week it lands in reads the rule for itself.
   */
  async searchEvents(
    calendarIds: readonly string[],
    text: string,
    from: Date,
    to: Date,
    limit: number,
  ): Promise<ExternalEvent[]> {
    const perCalendar = await Promise.all(
      calendarIds.map(async (calendarId) => {
        const query = new URLSearchParams({
          q: text,
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
          showDeleted: "false",
          maxResults: String(limit),
          fields: EVENT_FIELDS,
        });
        const page = await this.#request.send<GoogleEventsResponse>(`/calendars/${encode(calendarId)}/events?${query}`);
        const calendar: CalendarContext = {
          id: calendarId,
          timeZone: page.timeZone,
          readOnly: isReadOnlyRole(page.accessRole),
        };
        return (page.items ?? [])
          .filter((item) => !(item.eventType && IGNORED_EVENT_TYPES.has(item.eventType)))
          .map((item) => toExternalEvent(item, calendar));
      }),
    );
    return perCalendar.flat();
  }

  async #pages(calendarId: string, params: Record<string, string>): Promise<GoogleEventsResponse[]> {
    const pages: GoogleEventsResponse[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ ...params, ...(pageToken ? { pageToken } : {}) });
      const page = await this.#request.send<GoogleEventsResponse>(`/calendars/${encode(calendarId)}/events?${query}`);
      pages.push(page);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return pages;
  }

  #occurrences(calendarId: string, from: Date, to: Date) {
    return this.#pages(calendarId, {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "false",
      maxResults: String(PAGE_SIZE),
      fields: EVENT_FIELDS,
    });
  }

  /** The master of every series with an occurrence in the window — its rule and its start — by id. */
  async #rules(calendarId: string, from: Date, to: Date): Promise<Map<string, GoogleEvent>> {
    const pages = await this.#pages(calendarId, {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "false",
      showDeleted: "false",
      maxResults: String(PAGE_SIZE),
      fields: "nextPageToken,items(id,status,recurrence,start,end)",
    });
    const rules = new Map<string, GoogleEvent>();
    for (const page of pages) for (const item of page.items ?? []) if (item.recurrence) rules.set(item.id, item);
    return rules;
  }

  /**
   * Who has been on these calendars lately. One page-limited pass per calendar, asking only for
   * the guest lists: a span this long can hold thousands of events, and nothing here needs more
   * than the names on them. Rooms, projectors and your own line are left out — a resource is not
   * somebody you invite by typing their name, and neither are you.
   */
  async listPeople(calendarIds: readonly string[], from: Date, to: Date): Promise<ExternalPerson[]> {
    const perCalendar = await Promise.all(calendarIds.map((id) => this.#calendarPeople(id, from, to)));
    return perCalendar.flat();
  }

  async listContacts(): Promise<ExternalPerson[]> {
    if (!hasContactsScope(this.#scopes)) return [];
    return this.#people.list();
  }

  async #calendarPeople(calendarId: string, from: Date, to: Date): Promise<ExternalPerson[]> {
    const people: ExternalPerson[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < PEOPLE_PAGES; page++) {
      const query = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        showDeleted: "false",
        maxResults: String(PAGE_SIZE),
        fields: PEOPLE_FIELDS,
        ...(pageToken ? { pageToken } : {}),
      });
      const answer = await this.#request.send<GoogleEventsResponse>(`/calendars/${encode(calendarId)}/events?${query}`);
      for (const item of answer.items ?? []) {
        const day = item.start?.dateTime ?? item.start?.date;
        const lastSeen = day ? new Date(day) : null;
        const onIt: GoogleAttendee[] = [...(item.organizer ? [item.organizer] : []), ...(item.attendees ?? [])];
        for (const person of onIt) {
          if (!person.email || person.self || person.resource) continue;
          people.push({ email: person.email, name: person.displayName ?? null, lastSeen, photo: null });
        }
      }
      pageToken = answer.nextPageToken;
      if (!pageToken) break;
    }
    return people;
  }

  /** Google expands the series itself; asking for two is enough to know whether it is still one. */
  async countInstances(calendarId: string, seriesId: string, upTo: number): Promise<number> {
    const query = new URLSearchParams({ maxResults: String(upTo), showDeleted: "false", fields: "items(id)" });
    const page = await this.#request.send<GoogleEventsResponse>(
      `/calendars/${encode(calendarId)}/events/${encode(seriesId)}/instances?${query}`,
    );
    return (page.items ?? []).length;
  }
}
