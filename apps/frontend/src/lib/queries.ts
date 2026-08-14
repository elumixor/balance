import { api, apiGet, callApi, unwrapOk } from "./api";
import type {
  Activity,
  ActivityWeight,
  CalendarEvent,
  CalendarPrefs,
  CalendarWeek,
  Category,
  IntegrationStatus,
  MappingScope,
} from "./types";

// Categories
export const getCategories = () => callApi(api.categories.$get()).then((r) => r.categories as Category[]);
export const createCategory = (input: { name: string; color: string; icon: string; targetHoursPerWeek: number }) =>
  callApi(api.categories.$post(input)).then((r) => unwrapOk(r).category as Category);
export const updateCategory = (
  id: string,
  input: { name: string; color: string; icon: string; targetHoursPerWeek: number },
) => callApi(api.categories(id).$patch(input)).then((r) => unwrapOk(r).category as Category);
export const archiveCategory = (id: string) => callApi(api.categories(id).archive.$post()).then(unwrapOk);
export const restoreCategory = (id: string) => callApi(api.categories(id).restore.$post()).then(unwrapOk);

// Activities
export const getActivities = () => callApi(api.activities.$get()).then((r) => r.activities as Activity[]);
export const createActivity = (input: { name: string; weights: ActivityWeight[] }) =>
  callApi(api.activities.$post(input)).then((r) => unwrapOk(r).activity as Activity);
export const updateActivity = (id: string, input: { name: string; weights: ActivityWeight[] }) =>
  callApi(api.activities(id).$patch(input)).then((r) => unwrapOk(r).activity as Activity);
export const archiveActivity = (id: string) => callApi(api.activities(id).archive.$post()).then(unwrapOk);
export const restoreActivity = (id: string) => callApi(api.activities(id).restore.$post()).then(unwrapOk);

// Integrations
export const getIntegrations = () =>
  callApi(api.integrations.$get()).then((r) => unwrapOk(r).integrations as IntegrationStatus[]);
export const startGoogleConnect = (mode: "app" | "web", origin: string) =>
  callApi(api.integrations.google.start.$post({ mode, origin })).then((r) => unwrapOk(r).url);
export const disconnectGoogle = () => callApi(api.integrations.google.$delete()).then(unwrapOk);

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
export const saveEventMapping = (input: {
  calendarId: string;
  externalEventId: string;
  scope: MappingScope;
  activityId?: string | null;
  weights?: ActivityWeight[];
}) => callApi(api.calendar.mappings.$post(input)).then(unwrapOk);
export const removeEventMapping = (input: { calendarId: string; externalEventId: string; scope: MappingScope }) =>
  callApi(api.calendar.mappings.$delete(input)).then(unwrapOk);
