import { ApiError } from "../../api-error";
import { ProviderNeedsReconnectError } from "../errors";
import type { ProviderAccountService } from "../provider-accounts";
import type {
  CalendarProvider,
  CalendarRef,
  CreateEventInput,
  ExternalEvent,
  SelfResponse,
  UpdateEventInput,
} from "../types";
import type {
  GoogleAttendee,
  GoogleCalendarListEntry,
  GoogleErrorResponse,
  GoogleEvent,
  GoogleEventDateTime,
  GoogleEventsResponse,
} from "./api-types";
import { zonedDateToInstant } from "./zoned-date";

/**
 * The link that means "you are in the call". The conferencing block is the reliable answer — it
 * is where Google puts a Zoom or a Teams call added through an add-on, not just its own Meet —
 * and `hangoutLink` is the older field kept for events that only carry that.
 */
function conferenceUrl(event: GoogleEvent) {
  const video = event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video");
  return video?.uri ?? event.hangoutLink ?? null;
}

/**
 * The `YYYY-MM-DD` an all-day event is written as. The instant it comes from is midnight UTC by
 * construction (see `CreateEventInput.allDay`), so the date is read straight off it — converting
 * to any other zone here is what would move the event a day.
 */
function calendarDate(at: Date) {
  return at.toISOString().slice(0, 10);
}

/**
 * What the conferencing block is patched to. A request with a fresh id is how Google is asked
 * to make a Meet; null takes whatever call there is off the event.
 */
function conferenceBlock(conference: "create" | "remove") {
  if (conference === "remove") return null;
  return { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
}

const BASE_URL = "https://www.googleapis.com/calendar/v3";
const PAGE_SIZE = 250;
const RATE_LIMIT_RETRY_MS = 500;

/** Google's own noise: neither belongs on a time grid, and both arrive as all-day events. */
const IGNORED_EVENT_TYPES = new Set(["workingLocation", "birthday"]);

/**
 * Everything the app reads off an event, asked for by name. Google returns the whole event
 * otherwise, and a week of them is a lot of JSON for fields nothing draws.
 */
const ITEM_FIELDS =
  "id,status,summary,description,location,start,end,recurringEventId,recurrence,eventType,htmlLink,hangoutLink," +
  "conferenceData(entryPoints(entryPointType,uri,label,meetingCode),conferenceSolution(name,key/type))," +
  "organizer(email,displayName,self),attendees(email,displayName,self,organizer,optional,resource,responseStatus)," +
  "reminders(useDefault,overrides(method,minutes))";
const EVENT_FIELDS = `nextPageToken,timeZone,accessRole,items(${ITEM_FIELDS})`;
const SINGLE_EVENT_FIELDS = ITEM_FIELDS;

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google";

  constructor(
    private readonly accounts: ProviderAccountService,
    private readonly accountId: string,
  ) {}

  async listCalendars(): Promise<CalendarRef[]> {
    const response = await this.request<{ items: GoogleCalendarListEntry[] }>(
      "/users/me/calendarList?minAccessRole=reader&maxResults=250&fields=items(id,summary,summaryOverride,backgroundColor,primary,timeZone,accessRole)",
    );
    return (response.items ?? []).map((c) => ({
      id: c.id,
      name: c.summaryOverride ?? c.summary,
      color: c.backgroundColor ?? null,
      primary: c.primary === true,
      timeZone: c.timeZone,
      readOnly: c.accessRole !== "owner" && c.accessRole !== "writer",
    }));
  }

  async listEvents(calendarIds: readonly string[], from: Date, to: Date): Promise<ExternalEvent[]> {
    const perCalendar = await Promise.all(calendarIds.map((id) => this.listCalendarEvents(id, from, to)));
    return perCalendar.flat();
  }

  async createEvent(input: CreateEventInput): Promise<ExternalEvent> {
    const created = await this.request<GoogleEvent>(`/calendars/${encodeURIComponent(input.calendarId)}/events`, {
      method: "POST",
      body: {
        summary: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.location === undefined ? {} : { location: input.location }),
        ...(input.allDay
          ? { start: { date: calendarDate(input.start) }, end: { date: calendarDate(input.end) } }
          : { start: { dateTime: input.start.toISOString() }, end: { dateTime: input.end.toISOString() } }),
      },
    });
    return this.toExternalEvent(created, input.calendarId, "UTC", false);
  }

  /** The master event of a series, by its own id — used to shift a whole series by a delta. */
  async getEvent(calendarId: string, eventId: string): Promise<ExternalEvent> {
    const event = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?fields=${SINGLE_EVENT_FIELDS}`,
    );
    return this.toExternalEvent(event, calendarId, "UTC", false);
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

    const updated = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${params}`,
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
          ...(patch.attendees === undefined ? {} : { attendees: await this.guestList(calendarId, eventId, patch) }),
          ...(patch.conference === undefined ? {} : { conferenceData: conferenceBlock(patch.conference) }),
        },
      },
    );
    return this.toExternalEvent(updated, calendarId, "UTC", false);
  }

  /**
   * The list as it will be sent: whoever the patch names, keeping the answer anyone already on
   * it has given — replacing a guest with a fresh line would reset their reply to "not answered".
   */
  private async guestList(calendarId: string, eventId: string, patch: UpdateEventInput): Promise<GoogleAttendee[]> {
    const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const current = await this.request<GoogleEvent>(`${path}?fields=attendees(email,self,responseStatus,optional)`);
    const known = new Map((current.attendees ?? []).map((a) => [a.email?.toLowerCase(), a]));
    return (patch.attendees ?? []).map((guest) => ({
      ...known.get(guest.email.toLowerCase()),
      email: guest.email,
      optional: guest.optional === true,
    }));
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request<void>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      allowGone: true,
    });
  }

  /**
   * `singleEvents=true` makes Google expand recurrence into occurrences, so nothing downstream
   * ever parses an RRULE. It rules out `syncToken`, which is fine: no events are stored locally
   * for an incremental sync to update.
   */
  /**
   * Two asks of the same window, side by side: the occurrences the grid draws, and the masters
   * they repeat from — expansion (`singleEvents`) drops the rule from every occurrence, and a card
   * opened on one has to say how it repeats without a round trip of its own.
   */
  private async listCalendarEvents(calendarId: string, from: Date, to: Date): Promise<ExternalEvent[]> {
    const [pages, rules] = await Promise.all([
      this.occurrences(calendarId, from, to),
      this.rules(calendarId, from, to),
    ]);
    return pages.flatMap(({ page, readOnly }) =>
      (page.items ?? [])
        .filter((item) => !(item.eventType && IGNORED_EVENT_TYPES.has(item.eventType)))
        .map((item) => {
          const recurrence = item.recurringEventId ? rules.get(item.recurringEventId) : undefined;
          return this.toExternalEvent(recurrence ? { ...item, recurrence } : item, calendarId, page.timeZone, readOnly);
        }),
    );
  }

  private async occurrences(calendarId: string, from: Date, to: Date) {
    const pages: { page: GoogleEventsResponse; readOnly: boolean }[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        showDeleted: "false",
        maxResults: String(PAGE_SIZE),
        fields: EVENT_FIELDS,
        ...(pageToken ? { pageToken } : {}),
      });
      const page = await this.request<GoogleEventsResponse>(
        `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      );
      pages.push({ page, readOnly: page.accessRole !== "owner" && page.accessRole !== "writer" });
      pageToken = page.nextPageToken;
    } while (pageToken);
    return pages;
  }

  /** The rule of every series with an occurrence in the window, by the series' id. */
  private async rules(calendarId: string, from: Date, to: Date): Promise<Map<string, string[]>> {
    const rules = new Map<string, string[]>();
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "false",
        showDeleted: "false",
        maxResults: String(PAGE_SIZE),
        fields: "nextPageToken,items(id,recurrence)",
        ...(pageToken ? { pageToken } : {}),
      });
      const page = await this.request<GoogleEventsResponse>(
        `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      );
      for (const item of page.items ?? []) if (item.recurrence) rules.set(item.id, item.recurrence);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return rules;
  }

  private toExternalEvent(event: GoogleEvent, calendarId: string, timeZone: string, readOnly: boolean): ExternalEvent {
    const allDay = Boolean(event.start.date);
    const instant = (at: GoogleEventDateTime) => {
      if (at.dateTime) return new Date(at.dateTime);
      if (at.date) return zonedDateToInstant(at.date, timeZone);
      throw new ApiError("Google sent an event with no start or end", 502);
    };
    const self = event.attendees?.find((a) => a.self);

    return {
      id: event.id,
      calendarId,
      seriesId: event.recurringEventId ?? null,
      title: event.summary ?? "Untitled",
      description: event.description ?? null,
      start: instant(event.start),
      end: instant(event.end),
      allDay,
      status: event.status,
      selfResponse: (self?.responseStatus as SelfResponse | undefined) ?? null,
      readOnly,
      url: event.htmlLink ?? null,
      location: event.location ?? null,
      conferenceUrl: conferenceUrl(event),
      conferenceName: event.conferenceData?.conferenceSolution?.name ?? (event.hangoutLink ? "Google Meet" : null),
      attendees: (event.attendees ?? []).map((attendee) => ({
        email: attendee.email ?? null,
        name: attendee.displayName ?? null,
        self: attendee.self === true,
        response: (attendee.responseStatus as SelfResponse | undefined) ?? "needsAction",
        optional: attendee.optional === true,
        resource: attendee.resource === true,
      })),
      organizer: event.organizer
        ? {
            email: event.organizer.email ?? null,
            name: event.organizer.displayName ?? null,
            self: event.organizer.self === true,
          }
        : null,
      // Only the event's own reminders. `useDefault` means "whatever the calendar says", which is
      // a question about the calendar rather than the event — and the app has its own answer.
      reminders: (event.reminders?.overrides ?? [])
        .filter((reminder) => reminder.method === "popup" || reminder.method === "email")
        .map((reminder) => ({ method: reminder.method as "popup" | "email", minutes: reminder.minutes ?? 0 })),
      timeZone: event.start.timeZone ?? null,
      recurrence: event.recurrence ?? null,
    };
  }

  /**
   * Answering an invitation is a patch to your own line of the guest list — and Google replaces
   * the whole list rather than merging it, so the others have to be sent back untouched. The
   * event is read first for exactly that reason.
   */
  async respondToEvent(calendarId: string, eventId: string, response: SelfResponse): Promise<ExternalEvent> {
    const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const current = await this.request<GoogleEvent>(`${path}?fields=attendees(email,self,responseStatus)`);
    const attendees = current.attendees ?? [];
    if (!attendees.some((attendee) => attendee.self)) {
      throw new ApiError("You're not on the guest list for that event", 409);
    }

    const updated = await this.request<GoogleEvent>(`${path}?sendUpdates=all&fields=${SINGLE_EVENT_FIELDS}`, {
      method: "PATCH",
      body: {
        attendees: attendees.map((attendee) => (attendee.self ? { ...attendee, responseStatus: response } : attendee)),
      },
    });
    return this.toExternalEvent(updated, calendarId, "UTC", false);
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; allowGone?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    const token = await this.accounts.accessToken(this.accountId);
    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    if (response.ok) return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
    if (options.allowGone && (response.status === 404 || response.status === 410)) return undefined as T;

    const body = (await response.json().catch(() => ({}))) as GoogleErrorResponse;
    const reason = body.error?.errors?.[0]?.reason ?? "";

    // An access token can also die before its stated expiry — the account being re-granted,
    // for instance — so one forced refresh is worth trying before giving up on the connection.
    if (response.status === 401 && !options.retried) {
      const account = await this.accounts.getById(this.accountId);
      if (account) await this.accounts.refreshAccessToken(account);
      return this.request<T>(path, { ...options, retried: true });
    }
    if (response.status === 401 || reason === "insufficientPermissions") {
      throw new ProviderNeedsReconnectError(this.name);
    }
    if ((response.status === 403 && reason.includes("ateLimit")) || response.status === 429) {
      if (options.retried) throw new ApiError("Google Calendar is rate-limiting us — try again in a moment", 503);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
      return this.request<T>(path, { ...options, retried: true });
    }
    if (response.status === 404) throw new ApiError("That event no longer exists in Google Calendar", 404);

    throw new ApiError(`Google Calendar said: ${body.error?.message ?? response.statusText}`, 502);
  }
}
