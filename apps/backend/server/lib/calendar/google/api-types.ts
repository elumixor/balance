/** The slices of Google Calendar API v3 responses this app actually reads. */

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  timeZone: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
}

export interface GoogleEventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface GoogleAttendee {
  email?: string;
  displayName?: string;
  self?: boolean;
  organizer?: boolean;
  optional?: boolean;
  resource?: boolean;
  responseStatus?: string;
}

/** The conferencing block Google keeps on an event created with a call attached to it. */
export interface GoogleConferenceData {
  entryPoints?: { entryPointType?: string; uri?: string; label?: string; meetingCode?: string }[];
  conferenceSolution?: { key?: { type?: string }; name?: string; iconUri?: string };
  notes?: string;
}

export interface GoogleEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  recurringEventId?: string;
  eventType?: string;
  /** Whether guests other than the organizer may change the event. Absent means no. */
  guestsCanModify?: boolean;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: GoogleConferenceData;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  attendees?: GoogleAttendee[];
  reminders?: { useDefault?: boolean; overrides?: { method?: string; minutes?: number }[] };
  recurrence?: string[];
}

export interface GoogleEventsResponse {
  items: GoogleEvent[];
  nextPageToken?: string;
  timeZone: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
}

export interface GoogleErrorResponse {
  error?: { message?: string; errors?: { reason?: string }[] };
}
