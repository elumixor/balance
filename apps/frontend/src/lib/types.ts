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
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
  readOnly: boolean;
}

export interface CalendarPrefs {
  connected: boolean;
  needsReconnect: boolean;
  calendars: CalendarRef[];
  visibleCalendarIds: string[];
  writeCalendarId: string;
}

export interface IntegrationStatus {
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
