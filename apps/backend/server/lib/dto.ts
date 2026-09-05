import type { activityCategoryWeights, categories } from "../db/schema";
import { qualifyCalendarId, type ResolvedEvent } from "./calendar/events-service";
import type { CalendarRef, EventTimer, MappingScope, SelfResponse } from "./calendar/types";

/** Serializes a `categories` row into the shape the mobile app expects. */
export class CategoryDTO {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly targetHoursPerWeek: number;
  readonly isBuffer: boolean;
  readonly archived: boolean;

  constructor(c: typeof categories.$inferSelect) {
    this.id = c.id;
    this.name = c.name;
    this.color = c.color;
    this.icon = c.icon;
    this.targetHoursPerWeek = Number(c.targetHoursPerWeek);
    this.isBuffer = c.isBuffer;
    this.archived = c.archived;
  }
}

export type ActivityWeightDTO = { categoryId: string; weightPercent: number };

/** Serializes an activity (with its category weights) into the shape the mobile app expects. */
export class ActivityDTO {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  readonly weights: ActivityWeightDTO[];

  constructor(a: {
    id: string;
    name: string;
    archived: boolean;
    weights: (typeof activityCategoryWeights.$inferSelect)[];
  }) {
    this.id = a.id;
    this.name = a.name;
    this.archived = a.archived;
    this.weights = a.weights.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent }));
  }
}

/**
 * Serializes one of a connected account's calendars. `id` is qualified with the account it came
 * from — see `qualifyCalendarId` — so two accounts can't collide, and a write-back knows which
 * account to reach.
 */
export class CalendarDTO {
  readonly id: string;
  readonly accountId: string;
  readonly name: string;
  readonly color: string | null;
  readonly primary: boolean;
  readonly readOnly: boolean;

  constructor(c: CalendarRef, accountId: string) {
    this.id = qualifyCalendarId(accountId, c.id);
    this.accountId = accountId;
    this.name = c.name;
    this.color = c.color;
    this.primary = c.primary;
    this.readOnly = c.readOnly;
  }
}

/**
 * Serializes an external event with what it counts as. Category colours are deliberately absent:
 * the app already holds the categories, and one source of truth for a colour is enough.
 */
export class CalendarEventDTO {
  readonly id: string;
  readonly calendarId: string;
  readonly seriesId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
  readonly declined: boolean;
  readonly tentative: boolean;
  readonly readOnly: boolean;
  /** Whether its time, shape and words can be changed from here — see `ExternalEvent.movable`. */
  readonly movable: boolean;
  readonly countsTowardHours: boolean;
  readonly url: string | null;
  readonly mappingScope: MappingScope | null;
  readonly activityId: string | null;
  readonly activityName: string | null;
  readonly weights: ActivityWeightDTO[];
  /** What the hour was for — a project, a practice, a task — on top of what it counts as. */
  readonly projectId: string | null;
  readonly practiceId: string | null;
  readonly taskId: string | null;
  /** How a timer for it is broken up; null when it just runs to the end. */
  readonly timer: EventTimer | null;
  /** The integration feed this event is linked to — "apple-health:sleep" — or null. */
  readonly source: string | null;
  /** The card sections folded away on this event, or null for the default. */
  readonly hidden: string[] | null;
  /** What that feed observed for this occurrence, in its own shape; null until the device syncs. */
  readonly record: Record<string, unknown> | null;
  readonly location: string | null;
  readonly conferenceUrl: string | null;
  readonly conferenceName: string | null;
  readonly attendees: EventAttendeeDTO[];
  readonly organizer: EventAttendeeDTO | null;
  /** Whether the signed-in user is on the guest list, and can therefore answer the invitation. */
  readonly invited: boolean;
  readonly response: SelfResponse | null;
  readonly reminders: { method: "popup" | "email"; minutes: number }[];
  /** The IANA zone the event was written in, or null when the calendar didn't say. */
  readonly timeZone: string | null;
  /** The RRULE lines of a series, on its master and on every occurrence of it. */
  readonly recurrence: string[] | null;

  constructor(e: ResolvedEvent) {
    this.id = e.id;
    this.calendarId = qualifyCalendarId(e.accountId, e.calendarId);
    this.seriesId = e.seriesId;
    this.title = e.title;
    this.description = e.description;
    this.start = e.start.toISOString();
    this.end = e.end.toISOString();
    this.allDay = e.allDay;
    this.declined = e.selfResponse === "declined";
    this.tentative = e.status === "tentative" || e.selfResponse === "tentative";
    this.readOnly = e.readOnly;
    this.movable = e.movable;
    this.countsTowardHours = e.countsTowardHours;
    this.url = e.url;
    this.mappingScope = e.mapping?.scope ?? null;
    this.activityId = e.mapping?.activityId ?? null;
    this.activityName = e.mapping?.activityName ?? null;
    this.weights = e.weights.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent }));
    this.projectId = e.mapping?.projectId ?? null;
    this.practiceId = e.mapping?.practiceId ?? null;
    this.taskId = e.mapping?.taskId ?? null;
    this.timer = e.mapping?.timer ?? null;
    this.source = e.mapping?.source ?? null;
    this.hidden = e.mapping?.hidden ?? null;
    this.record = e.record;
    this.location = e.location;
    this.conferenceUrl = e.conferenceUrl;
    this.conferenceName = e.conferenceName;
    // Rooms and projectors are on the guest list too, and nobody wants to see them there.
    this.attendees = e.attendees.filter((a) => !a.resource).map(person);
    this.organizer = e.organizer ? { ...person({ ...e.organizer, response: "accepted", optional: false }) } : null;
    this.invited = e.attendees.some((a) => a.self);
    this.response = e.selfResponse;
    this.reminders = e.reminders.map((r) => ({ method: r.method, minutes: r.minutes }));
    this.timeZone = e.timeZone;
    this.recurrence = e.recurrence ? [...e.recurrence] : null;
  }
}

export interface EventAttendeeDTO {
  email: string | null;
  name: string | null;
  self: boolean;
  response: SelfResponse;
  optional: boolean;
}

function person(a: {
  email: string | null;
  name: string | null;
  self: boolean;
  response: SelfResponse;
  optional: boolean;
}): EventAttendeeDTO {
  return { email: a.email, name: a.name, self: a.self, response: a.response, optional: a.optional };
}
