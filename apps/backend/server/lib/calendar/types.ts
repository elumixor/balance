/**
 * Google's own alias for whichever calendar is the account's default. Standing in for it means
 * a freshly connected account works before the user has picked anything.
 */
export const PRIMARY_CALENDAR_ID = "primary";

export type EventStatus = "confirmed" | "tentative" | "cancelled";
export type SelfResponse = "accepted" | "declined" | "tentative" | "needsAction";
export type MappingScope = "instance" | "series";

export interface CalendarRef {
  readonly id: string;
  readonly name: string;
  /** The provider's own colour, used only where no category colour applies. */
  readonly color: string | null;
  readonly primary: boolean;
  readonly timeZone: string;
  readonly readOnly: boolean;
}

export interface ExternalEvent {
  /** The occurrence's id, unique within its calendar. */
  readonly id: string;
  readonly calendarId: string;
  /** The series this occurrence repeats from, or null for a one-off. */
  readonly seriesId: string | null;
  readonly title: string;
  /** The event's own notes, as the provider stores them. Empty is indistinguishable from absent. */
  readonly description: string | null;
  /** Absolute instants — all-day dates are resolved against the calendar's own time zone. */
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
  readonly status: EventStatus;
  /** null when the user isn't an attendee, which is the normal case for their own events. */
  readonly selfResponse: SelfResponse | null;
  readonly readOnly: boolean;
  readonly url: string | null;
  /** Where it is, as the invitation spells it — an address, a room, or sometimes a link. */
  readonly location: string | null;
  /** The one link that means "you are in the call", when the provider knows of one. */
  readonly conferenceUrl: string | null;
  /** What the call is: "Google Meet", "Zoom". Null when there's no conferencing on the event. */
  readonly conferenceName: string | null;
  readonly attendees: readonly EventAttendee[];
  readonly organizer: EventPerson | null;
  /** How long before it starts the calendar itself would say something, in minutes. */
  readonly reminders: readonly EventReminder[];
}

export interface EventPerson {
  readonly email: string | null;
  readonly name: string | null;
  readonly self: boolean;
}

export interface EventAttendee extends EventPerson {
  readonly response: SelfResponse;
  readonly optional: boolean;
  /** A room or a projector rather than a person — drawn differently, and never chased. */
  readonly resource: boolean;
}

export interface EventReminder {
  readonly method: "popup" | "email";
  readonly minutes: number;
}

export interface CreateEventInput {
  readonly calendarId: string;
  readonly title: string;
  readonly description?: string;
  readonly start: Date;
  readonly end: Date;
}

export interface UpdateEventInput {
  readonly title?: string;
  /** An empty string clears the notes, which is why this isn't merged into the absent case. */
  readonly description?: string;
  readonly start?: Date;
  readonly end?: Date;
}

/** What a calendar integration has to be able to do. Google today, Notion later. */
export interface CalendarProvider {
  readonly name: string;
  listCalendars(): Promise<CalendarRef[]>;
  listEvents(calendarIds: readonly string[], from: Date, to: Date): Promise<ExternalEvent[]>;
  getEvent(calendarId: string, eventId: string): Promise<ExternalEvent>;
  createEvent(input: CreateEventInput): Promise<ExternalEvent>;
  updateEvent(calendarId: string, eventId: string, patch: UpdateEventInput): Promise<ExternalEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  /** Answers an invitation as the signed-in user. */
  respondToEvent(calendarId: string, eventId: string, response: SelfResponse): Promise<ExternalEvent>;
}
