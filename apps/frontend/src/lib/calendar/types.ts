import type { ActivityWeight } from "$lib/core/records";

/** How far a change to a repeating event reaches: every occurrence, or this one and the ones after. */
export type SeriesScope = "all" | "following";

export type MappingScope = "instance" | "series";

/** An event in the connected calendar, with what it counts as already resolved. */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  seriesId: string | null;
  /** When the series began — its master's start — so the first occurrence can be told. */
  seriesStart: string | null;
  title: string;
  /** The event's notes in the calendar. null when it has none. */
  description: string | null;
  start: string;
  end: string;
  allDay: boolean;
  declined: boolean;
  tentative: boolean;
  /** The calendar itself can't be written — the account only reads it. */
  readOnly: boolean;
  /**
   * Whether its time, shape and words can be changed from here. False on a read-only calendar,
   * on an invitation whose organizer hasn't let guests modify it, and on an event Google made
   * out of a Gmail message. Answering, reminders and the app's own mapping still work.
   */
  movable: boolean;
  /** All-day and declined events are drawn and mappable, but move no category's total. */
  countsTowardHours: boolean;
  url: string | null;
  mappingScope: MappingScope | null;
  activityId: string | null;
  activityName: string | null;
  weights: ActivityWeight[];
  /** The practice the hour kept, on top of what it counts as. */
  practiceId: string | null;
  /** The work it was for in another app, by URN — `keep:page/<id>` — see `$lib/calendar/urn.ts`. */
  urn: string | null;
  /** How a timer run for it is broken up; null when it just runs to the end. */
  timer: EventTimer | null;
  /** The integration feed it is linked to — "apple-health:sleep" — or null. */
  source: string | null;
  /** The card sections folded away on this event, or null for the default. */
  hidden: string[] | null;
  /**
   * Where you are once it is over — a flight's destination, where a move ends — and so where the
   * next journey starts, see `$lib/travel/whereabouts.ts`. Null when it leaves you where you were.
   */
  endLocation: string | null;
  /**
   * The person's own notes about it, kept by this app and never written to the calendar — a
   * description is part of the invitation, so every guest reads it. Null when nothing is written.
   */
  notes: string | null;
  /** What that feed observed for this occurrence, in the feed's own shape; null until a device syncs. */
  record: Record<string, unknown> | null;
  /** Where it is, as the invitation spells it — an address, a room, or sometimes a link. */
  location: string | null;
  /** The link that means "you are in the call". */
  conferenceUrl: string | null;
  /** What the call is: "Google Meet", "Zoom". */
  conferenceName: string | null;
  attendees: EventAttendee[];
  organizer: EventAttendee | null;
  /** Whether you're on the guest list, and can therefore answer the invitation. */
  invited: boolean;
  response: EventResponse | null;
  /** What the calendar itself would say something about, and how long before. */
  reminders: EventReminder[];
  /** The IANA zone the event was written in, or null when the calendar didn't say. */
  timeZone: string | null;
  /** The RRULE lines of a series, on every occurrence of it; null for a one-off. */
  recurrence: string[] | null;
}

export interface EventReminder {
  method: "popup" | "email";
  minutes: number;
}

/**
 * What a block drawn before the calendar has ever seen it knows about being a meeting: nothing.
 * Drafts and drag ghosts are events on the grid without being events in anyone's calendar yet.
 */
export const NOT_A_MEETING = {
  practiceId: null,
  urn: null,
  timer: null,
  source: null,
  hidden: null,
  endLocation: null,
  notes: null,
  record: null,
  location: null,
  conferenceUrl: null,
  conferenceName: null,
  attendees: [],
  organizer: null,
  invited: false,
  response: null,
  reminders: [],
  timeZone: null,
  recurrence: null,
} satisfies Pick<
  CalendarEvent,
  | "practiceId"
  | "urn"
  | "timer"
  | "source"
  | "hidden"
  | "endLocation"
  | "notes"
  | "record"
  | "location"
  | "conferenceUrl"
  | "conferenceName"
  | "attendees"
  | "organizer"
  | "invited"
  | "response"
  | "reminders"
  | "timeZone"
  | "recurrence"
>;

/**
 * How a timer for an event is broken up: a nudge every so many minutes, or the event split into
 * equal parts. The length is the event's own, so it is never stored here.
 */
export type EventTimer = { kind: "every"; minutes: number } | { kind: "parts"; count: number };

export type EventResponse = "accepted" | "declined" | "tentative" | "needsAction";

export interface EventAttendee {
  email: string | null;
  name: string | null;
  self: boolean;
  response: EventResponse;
  optional: boolean;
}

export interface CalendarWeek {
  from: string;
  to: string;
  connected: boolean;
  needsReconnect: boolean;
  writeCalendarId: string;
  events: CalendarEvent[];
}

export interface CalendarRef {
  /** Qualified with the account it came from, so two accounts' ids can't collide. */
  id: string;
  accountId: string;
  name: string;
  color: string | null;
  primary: boolean;
  readOnly: boolean;
}

export interface CalendarAccount {
  accountId: string;
  email: string | null;
  needsReconnect: boolean;
  calendars: CalendarRef[];
}

export interface CalendarPrefs {
  connected: boolean;
  needsReconnect: boolean;
  accounts: CalendarAccount[];
  visibleCalendarIds: string[];
  writeCalendarId: string;
}
