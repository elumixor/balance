import { preferences } from "$lib/account/preferences.svelte";
import { hasAddress, meetingOf } from "$lib/calendar/meeting";
import type { CalendarEvent } from "$lib/calendar/types";
import { arrivalFor, getTravelTimes, type TravelLeg } from "./legs";
import { type OriginContext, travelOrigin } from "./origin.svelte";

/**
 * How long it takes to get to each event, remembered for the session.
 *
 * The card's chips, the band drawn above a block on the grid and the reminder all want the same
 * number, and a week on screen has a dozen events with an address — so the question is asked
 * once per event and journey, here, and every screen reads the one answer. A journey is a
 * question about a start, an origin and the ways of going: change any of them and it is a new
 * question, and the old answer is left where it was rather than shown for the wrong one.
 *
 * Nothing is asked about an event that has already started: the road it took is not worth a
 * request, and a bus that has left can't be asked about at all.
 */
class TravelTimes {
  #answers = $state<Record<string, TravelLeg[]>>({});
  #asking = new Set<string>();

  /** What makes two journeys the same question. */
  #keyFor(event: CalendarEvent, events: OriginContext): string | null {
    const modes = preferences.travel.modes;
    if (modes.length === 0 || !hasAddress(event)) return null;
    if (new Date(event.start).getTime() <= Date.now()) return null;
    const from = travelOrigin.originKeyFor(event, events);
    return `${event.id}|${arrivalFor(event.start)}|${meetingOf(event).location}|${from}|${modes.join(",")}`;
  }

  /**
   * The journeys to an event, in the order the ways of going were chosen, or null while nobody
   * has asked. Reading is free of side effects; `ensure` is what asks.
   */
  legsFor(event: CalendarEvent, events: OriginContext): TravelLeg[] | null {
    const key = this.#keyFor(event, events);
    return key ? (this.#answers[key] ?? null) : null;
  }

  /** The journey the grid and the reminder plan around: the first way of going that has one. */
  journeyFor(event: CalendarEvent, events: OriginContext): TravelLeg | null {
    return this.legsFor(event, events)?.[0] ?? null;
  }

  /**
   * Asks about the event's journey unless it is already known or on its way. The events are what
   * "where the calendar puts me" is read against — the screen's loaded weeks.
   */
  ensure(event: CalendarEvent, events: OriginContext) {
    const key = this.#keyFor(event, events);
    if (!key || key in this.#answers || this.#asking.has(key)) return;
    this.#asking.add(key);
    const destination = meetingOf(event).location as string;
    const modes = [...preferences.travel.modes];
    const arriveBy = arrivalFor(event.start);
    void travelOrigin
      .resolveFor(event, events)
      .then((origin) => (origin ? getTravelTimes({ origin, destination, modes, arriveBy }) : null))
      .then((answer) => {
        this.#answers = { ...this.#answers, [key]: answer?.available ? answer.legs : [] };
      })
      .catch(() => {
        // No answer is the same as no maps key: the screens simply say nothing about travel.
        this.#answers = { ...this.#answers, [key]: [] };
      })
      .finally(() => this.#asking.delete(key));
  }
}

export const travelTimes = new TravelTimes();
