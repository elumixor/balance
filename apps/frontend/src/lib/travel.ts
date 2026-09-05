import { api, callApi, unwrapOk } from "./api";
import { preferences, type TravelMode } from "./preferences.svelte";

/** How long it takes to get somewhere, one way of going. */
export interface TravelLeg {
  mode: TravelMode;
  seconds: number;
  meters: number;
  /** Google Maps, already pointed at this route. */
  url: string;
}

export interface TravelAnswer {
  /** False when the server has no maps key, in which case the app offers no travel times at all. */
  available: boolean;
  legs: TravelLeg[];
}

/**
 * Asked by the reminder, not by a screen: the server holds the maps key, and the answer is about
 * right now rather than about the week, so nothing caches it beyond the few minutes it's true for.
 */
export const getTravelTimes = (input: {
  origin: string;
  destination: string;
  modes: TravelMode[];
  arriveBy?: string;
}) => callApi(api.travel.$post(input)).then((r) => unwrapOk(r) as TravelAnswer);

/**
 * When a journey has to arrive: the event's start, less the minutes you'd rather be there early.
 * Every journey is asked about this instant — the reminder, the chips on the card and the band on
 * the grid — so they can never disagree about when to leave.
 */
export function arrivalFor(start: string) {
  return new Date(new Date(start).getTime() - preferences.travel.bufferMinutes * 60_000).toISOString();
}
