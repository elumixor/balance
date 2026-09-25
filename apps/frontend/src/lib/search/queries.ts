import { apiGet } from "$lib/core/api";

/** One event the calendar found for a few typed words — enough to draw a row and to open it. */
export interface EventHit {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
}

export const searchCalendar = (q: string) =>
  apiGet<{ hits: EventHit[] }>("/calendar/search", { q }).then((r) => r.hits);
