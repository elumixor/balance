import type { ExternalEvent, ProviderConference, SelfResponse } from "~/lib/calendar/types";
import { UpstreamError } from "~/lib/http/api-error";
import type { GoogleEvent, GoogleEventDateTime } from "./api-types";
import { zonedDateToInstant } from "./zoned-date";

/** Google writes these itself from a message, and refuses to let anyone else change them. */
const UNCHANGEABLE_EVENT_TYPES = new Set(["fromGmail"]);

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
export function calendarDate(at: Date) {
  return at.toISOString().slice(0, 10);
}

/**
 * What the conferencing block is patched to. A request with a fresh id is how Google is asked
 * to make a Meet; null takes whatever call there is off the event.
 */
export function conferenceBlock(conference: ProviderConference) {
  if (conference === "remove") return null;
  if (conference === "create")
    return { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  // Somebody else's call, handed to Google whole: a solution and its one video entry point is
  // what a calendar needs to draw a join button, and `addOn` is how a call Google didn't make
  // says so. There is at most one video entry point in a conference, which is all this holds.
  return {
    conferenceSolution: { key: { type: "addOn" }, name: conference.name ?? "Video call", iconUri: undefined },
    entryPoints: [
      {
        entryPointType: "video",
        uri: conference.url,
        label: conference.name ?? conference.url,
        ...(conference.meetingCode === undefined ? {} : { meetingCode: conference.meetingCode }),
      },
    ],
    ...(conference.notes === undefined ? {} : { notes: conference.notes }),
  };
}

/**
 * Whether Google would take a change to the event's time, title or guest list. An invitation is
 * the organizer's to change: a PATCH from anyone else answers 403 `forbiddenForNonOrganizer`
 * unless the organizer opened it up with `guestsCanModify`. `organizer.self` is Google's word for
 * "the organizer is this calendar", which is true of everything the user made themselves.
 */
function canBeChanged(event: GoogleEvent): boolean {
  if (UNCHANGEABLE_EVENT_TYPES.has(event.eventType ?? "")) return false;
  if (!event.organizer || event.organizer.self === true) return true;
  return event.guestsCanModify === true;
}

/** What a calendar's `accessRole` means for writing: only an owner or a writer can. */
export function isReadOnlyRole(accessRole: string | undefined): boolean {
  return accessRole !== "owner" && accessRole !== "writer";
}

/** The calendar an event was read from, as far as the event's own shape depends on it. */
export interface CalendarContext {
  readonly id: string;
  /** Where an all-day date is resolved to an instant. */
  readonly timeZone: string;
  readonly readOnly: boolean;
}

export function toExternalEvent(event: GoogleEvent, calendar: CalendarContext): ExternalEvent {
  const instant = (at: GoogleEventDateTime) => {
    if (at.dateTime) return new Date(at.dateTime);
    if (at.date) return zonedDateToInstant(at.date, calendar.timeZone);
    throw new UpstreamError("Google sent an event with no start or end");
  };
  const self = event.attendees?.find((a) => a.self);

  return {
    id: event.id,
    calendarId: calendar.id,
    seriesId: event.recurringEventId ?? null,
    // Known only from the master, which a listing looks up beside the occurrences.
    seriesStart: null,
    title: event.summary ?? "Untitled",
    description: event.description ?? null,
    start: instant(event.start),
    end: instant(event.end),
    allDay: Boolean(event.start.date),
    status: event.status,
    selfResponse: (self?.responseStatus as SelfResponse | undefined) ?? null,
    readOnly: calendar.readOnly,
    movable: !calendar.readOnly && canBeChanged(event),
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
