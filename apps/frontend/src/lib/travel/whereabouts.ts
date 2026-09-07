import type { CalendarEvent } from "$lib/calendar/types";

/**
 * Where the calendar says you are before an event — the answer a journey starts from when nobody
 * has chosen one for it.
 *
 * One rule, and no state of its own: you are wherever the last event that moved you left you. An
 * event moves you when it says where it ends — a flight to Kyiv, a move to the new flat — and
 * every other event, wherever it is, leaves you where you were: a meeting at the office is a
 * place you go to and come back from, not a place you now live. Before any move, the usual
 * place, which the caller adds.
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
    if (other.id === event.id || other.declined || other.endLocation === null) continue;
    const at = new Date(other.end).getTime();
    if (at > before || (latest && at <= latest.at)) continue;
    latest = { address: other.endLocation, event: other, at };
  }

  return latest && { address: latest.address, event: latest.event };
}
