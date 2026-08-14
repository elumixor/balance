import type { activityCategoryWeights, categories } from "../db/schema";
import type { ResolvedEvent } from "./calendar/events-service";
import type { CalendarRef, MappingScope } from "./calendar/types";

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

/** Serializes one of the connected account's calendars. */
export class CalendarDTO {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly primary: boolean;
  readonly readOnly: boolean;

  constructor(c: CalendarRef) {
    this.id = c.id;
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

  constructor(e: ResolvedEvent) {
    this.id = e.id;
    this.calendarId = e.calendarId;
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
  }
}
