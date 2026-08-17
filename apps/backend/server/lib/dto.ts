import type { activityCategoryWeights, categories } from "../db/schema";
import { qualifyCalendarId, type ResolvedEvent } from "./calendar/events-service";
import type { CalendarRef, MappingScope, SelfResponse } from "./calendar/types";

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
  readonly countsTowardHours: boolean;
  readonly url: string | null;
  readonly mappingScope: MappingScope | null;
  readonly activityId: string | null;
  readonly activityName: string | null;
  readonly weights: ActivityWeightDTO[];
  readonly location: string | null;
  readonly conferenceUrl: string | null;
  readonly conferenceName: string | null;
  readonly attendees: EventAttendeeDTO[];
  readonly organizer: EventAttendeeDTO | null;
  /** Whether the signed-in user is on the guest list, and can therefore answer the invitation. */
  readonly invited: boolean;
  readonly response: SelfResponse | null;
  readonly reminders: { method: "popup" | "email"; minutes: number }[];

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
    this.countsTowardHours = e.countsTowardHours;
    this.url = e.url;
    this.mappingScope = e.mapping?.scope ?? null;
    this.activityId = e.mapping?.activityId ?? null;
    this.activityName = e.mapping?.activityName ?? null;
    this.weights = e.weights.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent }));
    this.location = e.location;
    this.conferenceUrl = e.conferenceUrl;
    this.conferenceName = e.conferenceName;
    // Rooms and projectors are on the guest list too, and nobody wants to see them there.
    this.attendees = e.attendees.filter((a) => !a.resource).map(person);
    this.organizer = e.organizer ? { ...person({ ...e.organizer, response: "accepted", optional: false }) } : null;
    this.invited = e.attendees.some((a) => a.self);
    this.response = e.selfResponse;
    this.reminders = e.reminders.map((r) => ({ method: r.method, minutes: r.minutes }));
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
