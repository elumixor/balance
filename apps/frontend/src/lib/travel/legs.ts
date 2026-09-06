import { preferences } from "$lib/account/preferences.svelte";
import type { TravelMode } from "$lib/account/preferences-types";
import { api, callApi } from "$lib/core/api";

/** How long it takes to get somewhere, one way of going. */
export interface TravelLeg {
  mode: TravelMode;
  seconds: number;
  meters: number;
  /** Google Maps, already pointed at this route. */
  url: string;
}

interface TravelAnswer {
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
}) => callApi(api.travel.$post(input)).then((r) => r as TravelAnswer);

/**
 * When a journey has to arrive: the event's start, less the minutes you'd rather be there early.
 * Every journey is asked about this instant — the reminder, the chips on the card and the band on
 * the grid — so they can never disagree about when to leave.
 */
export function arrivalFor(start: string) {
  return withOffset(new Date(new Date(start).getTime() - preferences.travel.bufferMinutes * 60_000));
}

/**
 * The instant written with the device's own offset — "2026-09-06T18:00:00+02:00" — rather than
 * as UTC. The Routes API reads either; the maps link the server builds needs the wall clock,
 * because Google Maps takes an "arrive by" as local time, and a UTC instant put there arrives
 * two hours early in Prague.
 */
function withOffset(instant: Date) {
  const offset = -instant.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const local = new Date(instant.getTime() + offset * 60_000).toISOString().slice(0, 19);
  return `${local}${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}
