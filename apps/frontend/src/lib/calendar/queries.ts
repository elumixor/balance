import type {
  CalendarEvent,
  CalendarPrefs,
  CalendarWeek,
  EventReminder,
  EventTimer,
  MappingScope,
  SeriesScope,
} from "$lib/calendar/types";
import { api, apiGet, callApi } from "$lib/core/api";
import type { ActivityWeight } from "$lib/core/records";
import type { ExternalCall } from "./meeting";

export const getCalendarPrefs = () => callApi(api.calendar.calendars.$get()).then((r) => r as CalendarPrefs);

export const updateCalendarPrefs = (input: { visibleCalendarIds?: string[]; writeCalendarId?: string }) =>
  callApi(api.calendar.prefs.$patch(input));

/** Query params, so the raw helper — the generated client still doesn't wire them. */
export const getCalendarWeek = (from: string, to: string) => apiGet<CalendarWeek>("/calendar/events", { from, to });

export const createCalendarEvent = (input: {
  /** Absent for an event that counts as nothing — putting back a deleted one, say. */
  activityId?: string;
  /** For a block that counts straight toward categories rather than as one activity. */
  weights?: ActivityWeight[];
  practiceId?: string;
  urn?: string;
  timer?: EventTimer;
  start: string;
  end: string;
  calendarId?: string;
  title?: string;
  description?: string;
  location?: string;
  /** A date rather than a moment: both instants are midnight UTC, and `end` is the day after. */
  allDay?: boolean;
}) => callApi(api.calendar.events.$post(input)).then((r) => r.event as CalendarEvent);

export interface EventPatch {
  title?: string;
  description?: string;
  start?: string;
  end?: string;
  /** An empty string clears it, the way an empty description does. */
  location?: string;
  /** The zone the times are meant in; only means something sent with them. */
  timeZone?: string;
  /** The whole rule; an empty list makes a one-off of a series. Lands on the master. */
  recurrence?: string[];
  /** The whole list; empty is none. */
  reminders?: EventReminder[];
  /** The whole guest list; whoever is left off is uninvited. */
  attendees?: { email: string; optional?: boolean }[];
  /** Add the calendar's own call, or take the call off. */
  /** Google's own call, a room made in Zoom, none at all, or somebody else's by its join link. */
  conference?: "create" | "remove" | "zoom" | ExternalCall;
}

export const updateCalendarEvent = (
  id: string,
  input: EventPatch & {
    calendarId: string;
    /** Present only for a write meant to land on the series, not just this occurrence. */
    seriesId?: string;
    /** Every occurrence, or this one and the ones after it — which cuts the series in two. */
    seriesScope?: SeriesScope;
    previousStart?: string;
    previousEnd?: string;
  },
) => callApi(api.calendar.events(id).$patch(input)).then((r) => r.event as CalendarEvent);

/**
 * Hands the event to another calendar, which is what changing its organizer means. A repeating
 * event moves as a series, so its master is named; the answer is the event in its new home, with
 * a new id when the two calendars belong to different accounts.
 */
export const moveCalendarEvent = (
  id: string,
  input: { calendarId: string; destinationCalendarId: string; seriesId?: string },
) => callApi(api.calendar.events(id).move.$post(input)).then((r) => r.event as CalendarEvent);

/** The series it repeats from, when the delete means more than this one occurrence. */
export interface SeriesTarget {
  seriesId: string;
  seriesScope: SeriesScope;
  occurrenceStart: string;
}

/** `occurrenceOf` names the series a lone occurrence leaves, so one left alone becomes a one-off. */
export const deleteCalendarEvent = (id: string, calendarId: string, series?: SeriesTarget, occurrenceOf?: string) =>
  callApi(api.calendar.events(id).$delete({ calendarId, ...series, ...(occurrenceOf ? { occurrenceOf } : {}) }));

/** Yes, no or maybe to an invitation — written to the calendar the other guests are reading. */
export const respondToCalendarEvent = (
  id: string,
  calendarId: string,
  response: "accepted" | "declined" | "tentative",
) => callApi(api.calendar.events(id).rsvp.$post({ calendarId, response })).then((r) => r.event as CalendarEvent);

export const saveEventMapping = (input: {
  calendarId: string;
  externalEventId: string;
  scope: MappingScope;
  activityId?: string | null;
  weights?: ActivityWeight[];
  /** What the hour was for. Absent leaves it alone; null clears it. */
  practiceId?: string | null;
  urn?: string | null;
  /** How a timer for it is broken up. Absent leaves it alone; null clears it. */
  timer?: EventTimer | null;
  /** The integration feed it is linked to. Absent leaves it alone; null unlinks. */
  source?: string | null;
  /** The card sections folded away on it. Absent leaves it alone; null means the default. */
  hidden?: string[] | null;
  /** Where you are once it is over. Absent leaves it alone; null clears it. */
  endLocation?: string | null;
  /** Your own notes about it, which the calendar never sees. Absent leaves them; null clears. */
  notes?: string | null;
}) => callApi(api.calendar.mappings.$post(input));

/** Whether this deployment offers Zoom at all, and whether this account has connected it. */
export interface ZoomStatus {
  available: boolean;
  connected: boolean;
  needsReconnect: boolean;
  accountEmail: string;
}

export const getZoomStatus = () => apiGet<ZoomStatus>("/zoom/status");

export const startZoomConnect = (mode: "app" | "web", origin: string) =>
  callApi(api.zoom.start.$post({ mode, origin })).then((r) => r.url);

export const disconnectZoom = () => callApi(api.zoom.disconnect.$post({})) as Promise<void>;

export const removeEventMapping = (input: { calendarId: string; externalEventId: string; scope: MappingScope }) =>
  callApi(api.calendar.mappings.$delete(input));

/**
 * A guess at where an event leaves you — a proposal, written only when the person accepts it.
 * `available: false` when the model has nothing, which every caller draws as no guess.
 */
export const assistEndPlace = (input: {
  title: string;
  description: string;
  location: string | null;
  places: { label: string; address: string }[];
}) => callApi(api.calendar.assist.endPlace.$post(input));

/** Files the window's grey blocks the decision model hasn't been asked about — see `auto-file.ts`. */
export const classifyCalendarEvents = (range: { from: string; to: string }) =>
  callApi(api.calendar.classify.$post(range));
