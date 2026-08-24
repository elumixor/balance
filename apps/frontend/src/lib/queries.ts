import { api, apiGet, callApi, unwrapOk } from "./api";
import type { CommitResult, SessionNotification, SessionSummary, Slot } from "./planning/types";
import type { StoredPreferences } from "./preferences.svelte";
import type {
  ActivityWeight,
  CalendarEvent,
  CalendarPrefs,
  CalendarWeek,
  IntegrationStatus,
  MappingScope,
} from "./types";

// Auth
/** Trades this browser's session for a ticket the macOS app can sign in with — see `/desktop-link`. */
export const createDesktopTicket = () => callApi(api.auth.desktop.ticket.$post()).then((r) => unwrapOk(r).ticket);

// Integrations
export const getIntegrations = () =>
  callApi(api.integrations.$get()).then((r) => unwrapOk(r).integrations as IntegrationStatus[]);
export const startGoogleConnect = (mode: "app" | "web", origin: string) =>
  callApi(api.integrations.google.start.$post({ mode, origin })).then((r) => unwrapOk(r).url);
export const disconnectGoogle = (accountId: string) =>
  callApi(api.integrations.google.$delete({ accountId })).then(unwrapOk);

// Preferences
export const getPreferences = () => callApi(api.preferences.$get()).then((r) => unwrapOk(r) as StoredPreferences);
/** One section at a time, one setting at a time — the panel has no Save button. */
export const updatePreferences = (patch: {
  reminders?: Partial<StoredPreferences["reminders"]>;
  travel?: Partial<StoredPreferences["travel"]>;
  sessions?: Partial<StoredPreferences["sessions"]>;
}) => callApi(api.preferences.$patch(patch)).then(unwrapOk);

// Planning sessions
/** The zone travels with every ask: a planning day is a day in a place, and only the device knows. */
export const getSessionSummary = (slot: Slot, timeZone: string) =>
  apiGet<SessionSummary>("/planning/summary", { slot, timeZone });
export const getSessionNotifications = (timeZone: string) =>
  apiGet<{ enabled: boolean; slots: SessionNotification[] }>("/planning/notifications", { timeZone });
export const commitPlannedDay = (input: { day: string; timeZone: string; rest?: boolean }) =>
  callApi(api.planning.day.$post(input)).then((r) => unwrapOk(r) as CommitResult);
export const commitPlannedWeek = (input: { weekStart: string; timeZone: string }) =>
  callApi(api.planning.week.$post(input)).then((r) => unwrapOk(r) as CommitResult);

// Calendar
export const getCalendarPrefs = () => callApi(api.calendar.calendars.$get()).then((r) => unwrapOk(r) as CalendarPrefs);
export const updateCalendarPrefs = (input: { visibleCalendarIds?: string[]; writeCalendarId?: string }) =>
  callApi(api.calendar.prefs.$patch(input)).then(unwrapOk);
/** Query params, so the raw helper — the generated client still doesn't wire them. */
export const getCalendarWeek = (from: string, to: string) => apiGet<CalendarWeek>("/calendar/events", { from, to });
export const createCalendarEvent = (input: {
  /** Absent for an event that counts as nothing — putting back a deleted one, say. */
  activityId?: string;
  start: string;
  end: string;
  calendarId?: string;
  title?: string;
  description?: string;
  location?: string;
  /** A date rather than a moment: both instants are midnight UTC, and `end` is the day after. */
  allDay?: boolean;
}) => callApi(api.calendar.events.$post(input)).then((r) => unwrapOk(r).event as CalendarEvent);
export const updateCalendarEvent = (
  id: string,
  input: {
    calendarId: string;
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    /** Present only for a write meant to land on the whole series, not just this occurrence. */
    seriesId?: string;
    previousStart?: string;
    previousEnd?: string;
  },
) => callApi(api.calendar.events(id).$patch(input)).then((r) => unwrapOk(r).event as CalendarEvent);
export const deleteCalendarEvent = (id: string, calendarId: string) =>
  callApi(api.calendar.events(id).$delete({ calendarId })).then(unwrapOk);
/** Yes, no or maybe to an invitation — written to the calendar the other guests are reading. */
export const respondToCalendarEvent = (
  id: string,
  calendarId: string,
  response: "accepted" | "declined" | "tentative",
) =>
  callApi(api.calendar.events(id).rsvp.$post({ calendarId, response })).then((r) => unwrapOk(r).event as CalendarEvent);
export const saveEventMapping = (input: {
  calendarId: string;
  externalEventId: string;
  scope: MappingScope;
  activityId?: string | null;
  weights?: ActivityWeight[];
}) => callApi(api.calendar.mappings.$post(input)).then(unwrapOk);
export const removeEventMapping = (input: { calendarId: string; externalEventId: string; scope: MappingScope }) =>
  callApi(api.calendar.mappings.$delete(input)).then(unwrapOk);
