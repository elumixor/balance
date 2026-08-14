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
  GoogleCalendarListEntry,
  GoogleErrorResponse,
  GoogleEvent,
  GoogleEventDateTime,
  GoogleEventsResponse,
} from "./api-types";
import { zonedDateToInstant } from "./zoned-date";

const BASE_URL = "https://www.googleapis.com/calendar/v3";
const PAGE_SIZE = 250;
const RATE_LIMIT_RETRY_MS = 500;

/** Google's own noise: neither belongs on a time grid, and both arrive as all-day events. */
const IGNORED_EVENT_TYPES = new Set(["workingLocation", "birthday"]);

const EVENT_FIELDS =
  "nextPageToken,timeZone,accessRole,items(id,status,summary,description,start,end,recurringEventId,eventType,htmlLink,attendees(self,responseStatus))";
const SINGLE_EVENT_FIELDS =
  "id,status,summary,description,start,end,recurringEventId,eventType,htmlLink,attendees(self,responseStatus)";

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google";

  constructor(private readonly accounts: ProviderAccountService) {}

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
        start: { dateTime: input.start.toISOString() },
        end: { dateTime: input.end.toISOString() },
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

  async updateEvent(calendarId: string, eventId: string, patch: UpdateEventInput): Promise<ExternalEvent> {
    const updated = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: {
          ...(patch.title === undefined ? {} : { summary: patch.title }),
          ...(patch.description === undefined ? {} : { description: patch.description }),
          ...(patch.start === undefined ? {} : { start: { dateTime: patch.start.toISOString() } }),
          ...(patch.end === undefined ? {} : { end: { dateTime: patch.end.toISOString() } }),
        },
      },
    );
    return this.toExternalEvent(updated, calendarId, "UTC", false);
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
  private async listCalendarEvents(calendarId: string, from: Date, to: Date): Promise<ExternalEvent[]> {
    const events: ExternalEvent[] = [];
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
      const readOnly = page.accessRole !== "owner" && page.accessRole !== "writer";

      for (const item of page.items ?? []) {
        if (item.eventType && IGNORED_EVENT_TYPES.has(item.eventType)) continue;
        events.push(this.toExternalEvent(item, calendarId, page.timeZone, readOnly));
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    return events;
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
    };
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; allowGone?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    const token = await this.accounts.accessToken(this.name);
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
      const account = await this.accounts.get(this.name);
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
