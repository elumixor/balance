/**
 * A category the user plans against. Archiving one is how it's deleted, and a deleted record
 * never reaches a screen — see `synced.svelte.ts` — so there is no `archived` to check here.
 */
export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  targetHoursPerWeek: number;
  /** The system-managed category absorbing whatever the week hasn't been planned into. */
  isBuffer: boolean;
}

export interface ActivityWeight {
  categoryId: string;
  weightPercent: number;
}

export interface Activity {
  id: string;
  name: string;
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
  /** What the hour was for — a project, a practice, a task — on top of what it counts as. */
  projectId: string | null;
  practiceId: string | null;
  taskId: string | null;
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
  projectId: null,
  practiceId: null,
  taskId: null,
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
  | "projectId"
  | "practiceId"
  | "taskId"
  | "location"
  | "conferenceUrl"
  | "conferenceName"
  | "attendees"
  | "organizer"
  | "invited"
  | "response"
  | "reminders"
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

// --- Projects ------------------------------------------------------------

/** A statement about the world. Holds no hours, ever — there is no field for them. */
export interface Goal {
  id: string;
  /** The sphere it belongs to — a category on the ring. */
  categoryId: string;
  statement: string;
  measure: string | null;
  /** `YYYY-MM-DD`, or null for "ongoing". */
  horizon: string | null;
}

/** Something recurring that never completes, measured only by whether it kept happening. */
export interface Practice {
  id: string;
  goalId: string | null;
  categoryId: string;
  name: string;
  unit: "times" | "hours";
  targetPerWeek: number;
}

export type ProjectStatus = "active" | "held" | "parked" | "shipped" | "killed";
export type ProjectTemplate = "build" | "search" | "delivery" | "exit" | "evergreen" | "simple";

export interface ProjectLink {
  label: string;
  url: string;
}

/** Bounded work that claims hours a week from a sphere and ends in a decision. */
export interface Project {
  id: string;
  goalId: string | null;
  categoryId: string;
  name: string;
  description: string;
  template: ProjectTemplate;
  hoursPerWeek: number;
  status: ProjectStatus;
  /** An emoji, or an image URL. Null falls back to the sphere's icon. */
  cover: string | null;
  links: ProjectLink[];
  people: string[];
  /** Delivery-type projects take an external date instead of deriving one. */
  deadline: string | null;
  unparkTrigger: string | null;
}

export type GateMetric = "days" | "people" | "throughput" | "event" | "hours";
export type StageOutcome = "ship" | "park" | "kill" | "restart";

export interface Checkpoint {
  day: string;
  count: number;
  moved: boolean;
  note: string;
}

/** One gate on the way through a project. The date is the server's, derived once and never edited. */
export interface Stage {
  id: string;
  projectId: string;
  ordinal: number;
  name: string;
  sentence: string;
  metric: GateMetric;
  threshold: number;
  windowDays: number;
  budgetHours: number;
  startedOn: string | null;
  decideOn: string | null;
  extendedOn: string | null;
  extensionNote: string | null;
  outcome: StageOutcome | null;
  decidedOn: string | null;
  decisionNote: string | null;
  checkpoints: Checkpoint[];
}

export interface Task {
  id: string;
  stageId: string;
  title: string;
  estimateHours: number | null;
  done: boolean;
  ordinal: number;
}

export type GateSource = "manual" | "product" | "timer";

/** One thing a gate counts that the calendar can't see. */
export interface GateEvent {
  id: string;
  stageId: string;
  day: string;
  source: GateSource;
  actorKey: string | null;
  note: string | null;
  quantity: number;
}

/** What a gate has counted so far — see `gates.ts` on the server. */
export interface GateProgress {
  count: number;
  threshold: number;
  windowStart: string;
  windowEnd: string;
  /** False until the window has opened: not measurable is not the same as failing. */
  measurable: boolean;
  passed: boolean;
}

export interface ProjectProgress {
  /** Hours logged per week, oldest first, this week last. Same length as `Progress.weeks`. */
  hoursByWeek: number[];
  stageId: string | null;
  gate: GateProgress | null;
}

export interface PracticeProgress {
  byWeek: number[];
  /** Kept over the last four whole weeks, as a share of the target. */
  adherence: number;
}

/** The calendar's answer to every project and practice at once — `/mobile/projects/progress`. */
export interface Progress {
  connected: boolean;
  needsReconnect: boolean;
  /** The Monday of each column, `YYYY-MM-DD`. */
  weeks: string[];
  projects: Record<string, ProjectProgress>;
  practices: Record<string, PracticeProgress>;
}
