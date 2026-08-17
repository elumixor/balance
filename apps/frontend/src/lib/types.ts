export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  targetHoursPerWeek: number;
  isBuffer: boolean;
  archived: boolean;
}

export interface ActivityWeight {
  categoryId: string;
  weightPercent: number;
}

export interface Activity {
  id: string;
  name: string;
  archived: boolean;
  weights: ActivityWeight[];
}

export type MappingScope = "instance" | "series";

/** An event in the connected calendar, with what it counts as already resolved. */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  seriesId: string | null;
  title: string;
  /** The event's notes in the calendar. null when it has none. */
  description: string | null;
  start: string;
  end: string;
  allDay: boolean;
  declined: boolean;
  tentative: boolean;
  readOnly: boolean;
  /** All-day and declined events are drawn and mappable, but move no category's total. */
  countsTowardHours: boolean;
  url: string | null;
  mappingScope: MappingScope | null;
  activityId: string | null;
  activityName: string | null;
  weights: ActivityWeight[];
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
  reminders: { method: "popup" | "email"; minutes: number }[];
}

/**
 * What a block drawn before the calendar has ever seen it knows about being a meeting: nothing.
 * Drafts and drag ghosts are events on the grid without being events in anyone's calendar yet.
 */
export const NOT_A_MEETING = {
  location: null,
  conferenceUrl: null,
  conferenceName: null,
  attendees: [],
  organizer: null,
  invited: false,
  response: null,
  reminders: [],
} satisfies Pick<
  CalendarEvent,
  "location" | "conferenceUrl" | "conferenceName" | "attendees" | "organizer" | "invited" | "response" | "reminders"
>;

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

export interface IntegrationStatus {
  accountId: string;
  provider: string;
  connected: boolean;
  needsReconnect: boolean;
  email: string | null;
}

/** A stacked-bar slice: an activity's share of one category. */
export type Split = { id: string; color: string; value: number };

export type RingSegment = {
  id: string;
  label: string;
  color: string;
  /** Drawn in the band when the slice is wide enough to hold it. */
  icon?: string;
  /** Values share one unit; the ring maps their sum onto 360°. */
  value: number;
};
