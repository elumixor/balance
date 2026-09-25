/**
 * Google's own alias for whichever calendar is the account's default. Standing in for it means
 * a freshly connected account works before the user has picked anything.
 */
export const PRIMARY_CALENDAR_ID = "primary";

export type EventStatus = "confirmed" | "tentative" | "cancelled";
export type SelfResponse = "accepted" | "declined" | "tentative" | "needsAction";
export type MappingScope = "instance" | "series";
/** How far a change to a repeating event reaches: every occurrence, or this one and the ones after. */
export type SeriesScope = "all" | "following";

/**
 * How a timer run for an event is broken up. The length is always the event's own duration, so
 * only the rhythm is a choice: a nudge every so many minutes, or the whole split into equal parts.
 */
export type EventTimer = { kind: "every"; minutes: number } | { kind: "parts"; count: number };

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
  /** When the series began — its master's start — so a card can tell the first occurrence. */
  readonly seriesStart: Date | null;
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
  /** The calendar itself can't be written — the account only reads it. */
  readonly readOnly: boolean;
  /**
   * Whether its time, shape and words can be changed from here. False on a read-only calendar,
   * on an invitation whose organizer hasn't let guests modify it, and on an event Google made
   * out of a Gmail message. Answering the invitation and the app's own mapping still work.
   */
  readonly movable: boolean;
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
  /** The IANA zone the event was written in, when the provider says. Null for an all-day event. */
  readonly timeZone: string | null;
  /** The rule a series repeats by — `RRULE:FREQ=DAILY` — on its master and every occurrence. */
  readonly recurrence: readonly string[] | null;
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

/**
 * Somebody the account already knows: met on a shared event, or written down in its address book.
 * Only an address and a name, because that is all a guest list takes.
 */
export interface ExternalPerson {
  readonly email: string;
  readonly name: string | null;
  /** The last event they were on, or null for an address-book entry nothing has been shared with. */
  readonly lastSeen: Date | null;
  /** The picture the address book keeps for them, when it keeps one. */
  readonly photo: string | null;
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
  /** Where it is, as the source spelled it — an address, a room, or sometimes a link. */
  readonly location?: string;
  /**
   * A date rather than a moment. An all-day event has no time zone of its own, so its two dates
   * are carried here as midnight UTC and read back off the instant — `end` is exclusive, the way
   * both iCalendar and Google write it.
   */
  readonly allDay?: boolean;
  /** The rest of what a series carries, when a new one is made out of half of an old one. */
  readonly timeZone?: string;
  readonly recurrence?: readonly string[];
  readonly reminders?: readonly EventReminder[];
  readonly attendees?: readonly AttendeeInput[];
  /** `"create"` asks Google for a Meet link as the event is written. */
  readonly conference?: ProviderConference;
}

/** Someone on the guest list, as the card writes them: an address, and whether they're optional. */
export interface AttendeeInput {
  readonly email: string;
  readonly optional?: boolean;
}

/**
 * What the event's call should be: Google's own Meet, a room made in the connected Zoom account,
 * none at all, or somebody else's call by its join link — written as the conference block Google
 * draws a join button from rather than as a line in the notes, so every guest's calendar shows it
 * the way it shows a Meet. `"zoom"` is resolved to one of those links before the calendar sees
 * it: Google mints nothing but its own.
 */
export type ConferenceInput = ProviderConference | "zoom";

/** What a calendar can actually be asked for: its own call, none, or one made somewhere else. */
export type ProviderConference = "create" | "remove" | ExternalConference;

/** A call that already exists somewhere else, as the calendar is asked to hold it. */
export interface ExternalConference {
  /** Where the call is: the join URL, which is the one field a guest actually uses. */
  readonly url: string;
  /** What to call it — "Zoom Meeting". Shown beside the link on every calendar that draws it. */
  readonly name?: string;
  /** The meeting id as its provider writes it, shown under the link. */
  readonly meetingCode?: string;
  /** Anything a guest needs that the link doesn't carry: a passcode, a dial-in. */
  readonly notes?: string;
}

export interface UpdateEventInput {
  readonly title?: string;
  /** An empty string clears the notes, which is why this isn't merged into the absent case. */
  readonly description?: string;
  readonly start?: Date;
  readonly end?: Date;
  /** An empty string clears it, the same way the notes are cleared. */
  readonly location?: string;
  /** The zone the times are meant in. Written with the times, so it means nothing on its own. */
  readonly timeZone?: string;
  /** RRULE lines for the whole series; an empty list makes a one-off of it. Master events only. */
  readonly recurrence?: readonly string[];
  /** The whole list, replacing the event's own. Empty means no reminders at all. */
  readonly reminders?: readonly EventReminder[];
  /** The whole guest list, replacing the event's own. Whoever is dropped is uninvited. */
  readonly attendees?: readonly AttendeeInput[];
  readonly conference?: ProviderConference;
}

/** What a calendar integration has to be able to do. Google today, Notion later. */
export interface CalendarProvider {
  readonly name: string;
  listCalendars(): Promise<CalendarRef[]>;
  listEvents(calendarIds: readonly string[], from: Date, to: Date): Promise<ExternalEvent[]>;
  /** The events whose words — title, notes, place, guests — hold the text, newest first, capped. */
  searchEvents(
    calendarIds: readonly string[],
    text: string,
    from: Date,
    to: Date,
    limit: number,
  ): Promise<ExternalEvent[]>;
  getEvent(calendarId: string, eventId: string): Promise<ExternalEvent>;
  createEvent(input: CreateEventInput): Promise<ExternalEvent>;
  updateEvent(calendarId: string, eventId: string, patch: UpdateEventInput): Promise<ExternalEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  /**
   * Hands the event to another of the same account's calendars, which is what changing its
   * organizer means. Two accounts can't do this between them — see `CalendarEventsService.move`.
   */
  moveEvent(calendarId: string, eventId: string, destinationCalendarId: string): Promise<ExternalEvent>;
  /** How many occurrences a series still has, counted only as far as `upTo`. */
  countInstances(calendarId: string, seriesId: string, upTo: number): Promise<number>;
  /** Answers an invitation as the signed-in user. */
  respondToEvent(calendarId: string, eventId: string, response: SelfResponse): Promise<ExternalEvent>;
  /** Everyone on the guest lists of these calendars over a span — the people, not the events. */
  listPeople(calendarIds: readonly string[], from: Date, to: Date): Promise<ExternalPerson[]>;
  /** The account's own address book, when the grant covers reading it. Empty when it doesn't. */
  listContacts(): Promise<ExternalPerson[]>;
}
