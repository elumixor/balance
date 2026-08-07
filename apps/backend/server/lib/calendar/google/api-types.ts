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
}

export interface GoogleEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  recurringEventId?: string;
  eventType?: string;
  htmlLink?: string;
  attendees?: { self?: boolean; responseStatus: string }[];
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
