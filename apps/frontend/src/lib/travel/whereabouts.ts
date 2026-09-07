import { hasAddress, meetingOf } from "$lib/calendar/meeting";
import type { CalendarEvent } from "$lib/calendar/types";

/**
 * Where the calendar says you are before an event — the answer a journey starts from when nobody
 * has chosen one for it.
 *
 * Two kinds of event move you. One marked as a place change ("Stay here" on its card) does so
 * deliberately: a timed one puts you at its location from the moment it ends, until the next
 * change; an all-day one is a trip — you are there for its days, and once it is over you are back
 * wherever you were before it, and whatever moved you during it is over too. The other kind is any
 * event with an address that ended a little while ago: a meeting across town that finished twenty
 * minutes before the next one is where the next one is left from, marked or not.
 *
 * Nothing here is stored, and nothing is asked of a server. The events are whichever ones the
 * caller has — the calendar screen's loaded weeks, the reminders' this-week-and-next — so a move
 * older than that has scrolled out of sight; a stay meant to last is an all-day span for that reason.
 */

/** A meeting that ended this long ago is one you haven't left yet. */
export const STILL_THERE_MS = 2 * 60 * 60_000;

export interface Whereabout {
  /** The address as the event spells it, which is what the Routes API is asked from. */
  readonly address: string;
  /** The event that put you there. */
  readonly event: CalendarEvent;
}

interface Move extends Whereabout {
  /** When you are there from. */
  readonly at: number;
  readonly deliberate: boolean;
}

export function placeBefore(event: CalendarEvent, events: readonly CalendarEvent[]): Whereabout | null {
  const before = new Date(event.start).getTime();
  const moves: Move[] = [];
  const finishedTrips: { from: number; to: number }[] = [];

  for (const other of events) {
    if (other.id === event.id || other.declined) continue;
    const address = meetingOf(other).location;
    if (address === null) continue;
    const start = new Date(other.start).getTime();
    const end = new Date(other.end).getTime();

    if (other.placeChange && other.allDay) {
      if (end <= before) finishedTrips.push({ from: start, to: end });
      else if (start <= before) moves.push({ address, event: other, at: start, deliberate: true });
      continue;
    }
    if (end > before) continue;
    if (other.placeChange) moves.push({ address, event: other, at: end, deliberate: true });
    else if (!other.allDay && hasAddress(other) && before - end <= STILL_THERE_MS)
      moves.push({ address, event: other, at: end, deliberate: false });
  }

  // A trip that is over took everything that happened during it with it: the hotel you checked
  // into on Tuesday is not where Friday's journey starts once you have flown home.
  const still = moves.filter((move) => !finishedTrips.some((trip) => move.at >= trip.from && move.at < trip.to));
  still.sort((a, b) => b.at - a.at || Number(b.deliberate) - Number(a.deliberate));
  const latest = still[0];
  return latest ? { address: latest.address, event: latest.event } : null;
}
