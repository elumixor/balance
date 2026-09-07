import { meetingOf } from "$lib/calendar/meeting";
import type { CalendarEvent } from "$lib/calendar/types";

/**
 * Where the calendar says you are before an event — the answer a journey starts from when nobody
 * has chosen one for it.
 *
 * One rule, and no state of its own: you are wherever the last event with a place left you. That
 * is its end place when it names one — a flight lands somewhere other than the airport it left
 * from — and its location otherwise, from the moment it ends, or from the day it starts when it
 * is all-day. An event with neither — a call, a block of deep work, "lunch" — changes nothing.
 * Before any of them, the usual place, which the caller adds.
 *
 * Nothing is asked of a server. The events are whichever ones the caller has — the calendar
 * screen's loaded weeks, the reminders' this-week-and-next — so a move older than that is out of
 * sight, and the usual place stands in for it.
 */

export interface Whereabout {
  /** The place as the event spells it, which is what the Routes API is asked from. */
  readonly address: string;
  /** The event that left you there. */
  readonly event: CalendarEvent;
}

export function placeBefore(event: CalendarEvent, events: readonly CalendarEvent[]): Whereabout | null {
  const before = new Date(event.start).getTime();
  let latest: (Whereabout & { at: number }) | null = null;

  for (const other of events) {
    if (other.id === event.id || other.declined) continue;
    const address = other.endLocation ?? meetingOf(other).location;
    if (address === null) continue;
    // An all-day event is a place for the day; a timed one is a place you are at once it is over.
    const at = new Date(other.allDay && !other.endLocation ? other.start : other.end).getTime();
    if (at > before || (latest && at <= latest.at)) continue;
    latest = { address, event: other, at };
  }

  return latest && { address: latest.address, event: latest.event };
}
