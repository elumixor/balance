import { api, apiGet, callApi, unwrapOk } from "./api";
import type { CommitResult, SessionNotification, SessionSummary, Slot } from "./planning/types";
import type { StoredPreferences } from "./preferences.svelte";
import type {
  ActivityWeight,
  Assisted,
  CalendarEvent,
  CalendarPrefs,
  CalendarWeek,
  CheckpointHelp,
  CreateSuggestion,
  DecisionAdvice,
  EventPlan,
  EventReminder,
  EventTimer,
  IntegrationStatus,
  MappingScope,
  Progress,
  WeekNote,
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
/** What an integration on this device observed for the occurrences it is linked to — see `integrations.svelte.ts`. */
export const saveIntegrationRecords = (input: {
  source: string;
  records: { calendarId: string; externalEventId: string; data: Record<string, unknown> }[];
}) => callApi(api.integrations.records.$post(input)).then(unwrapOk);

export const getPreferences = () => callApi(api.preferences.$get()).then((r) => unwrapOk(r) as StoredPreferences);
/** One section at a time, one setting at a time — the panel has no Save button. */
export const updatePreferences = (patch: {
  reminders?: Partial<StoredPreferences["reminders"]>;
  travel?: Partial<StoredPreferences["travel"]>;
  sessions?: Partial<StoredPreferences["sessions"]>;
  zones?: Partial<StoredPreferences["zones"]>;
  card?: Partial<StoredPreferences["card"]>;
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
  /** For a block that counts straight toward categories — a project's sphere, say. */
  weights?: ActivityWeight[];
  projectId?: string;
  practiceId?: string;
  taskId?: string;
  timer?: EventTimer;
  start: string;
  end: string;
  calendarId?: string;
  title?: string;
  description?: string;
  location?: string;
  /** A date rather than a moment: both instants are midnight UTC, and `end` is the day after. */
  allDay?: boolean;
}) => callApi(api.calendar.events.$post(input)).then((r) => unwrapOk(r).event as CalendarEvent);
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
  conference?: "create" | "remove";
}
export const updateCalendarEvent = (
  id: string,
  input: EventPatch & {
    calendarId: string;
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
  /** What the hour was for. Absent leaves it alone; null clears it. */
  projectId?: string | null;
  practiceId?: string | null;
  taskId?: string | null;
  /** How a timer for it is broken up. Absent leaves it alone; null clears it. */
  timer?: EventTimer | null;
  /** The integration feed it is linked to. Absent leaves it alone; null unlinks. */
  source?: string | null;
}) => callApi(api.calendar.mappings.$post(input)).then(unwrapOk);
export const removeEventMapping = (input: { calendarId: string; externalEventId: string; scope: MappingScope }) =>
  callApi(api.calendar.mappings.$delete(input)).then(unwrapOk);

// Projects
/** The device's day and zone travel with the ask, the same way the planning sessions send theirs. */
export const getProjectProgress = (timeZone: string, today: string) =>
  apiGet<Progress>("/projects/progress", { timeZone, today });

// The assistant's six moments. Each is a proposal; the screen that asked decides what to do with it.
export const assistCreate = (input: { idea: string; sphere: string; existingProjects: string[] }) =>
  callApi(api.projects.assist.create.$post(input)).then((r) => unwrapOk(r) as Assisted<CreateSuggestion>);
export const assistWeek = (input: {
  freeHours: number;
  projects: {
    id: string;
    name: string;
    claimed: number;
    logged: number;
    priority: number;
  }[];
  fixed: string[];
}) => callApi(api.projects.assist.week.$post(input)).then((r) => unwrapOk(r) as Assisted<WeekNote>);
export const assistCheckpoint = (input: {
  project: string;
  stage: string;
  sentence: string;
  count: number;
  threshold: number;
  note: string;
}) => callApi(api.projects.assist.checkpoint.$post(input)).then((r) => unwrapOk(r) as Assisted<CheckpointHelp>);
export const assistDecision = (input: {
  project: string;
  stage: string;
  sentence: string;
  count: number;
  threshold: number;
  measurable: boolean;
  hoursInvested: number;
  hoursPerWeek: number;
  extended: boolean;
  isLast: boolean;
  checkpoints: { day: string; count: number; moved: boolean; note: string }[];
}) => callApi(api.projects.assist.decision.$post(input)).then((r) => unwrapOk(r) as Assisted<DecisionAdvice>);
export type EventPlanInput = {
  title: string;
  description: string;
  hours: number;
  sphere: string;
  project: {
    id: string;
    name: string;
    description: string;
    stage: string;
    sentence: string;
    hoursPerWeek: number;
    tasks: {
      id: string;
      title: string;
      estimateHours: number | null;
      done: boolean;
    }[];
  } | null;
  candidates: { id: string; name: string; description: string }[];
  answers: { question: string; answer: string }[];
};
export const assistEvent = (input: EventPlanInput) =>
  callApi(api.projects.assist.event.$post(input)).then((r) => unwrapOk(r) as Assisted<EventPlan>);
