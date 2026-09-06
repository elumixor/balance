import { ApiError } from "~/lib/http/api-error";
import { TtlCache } from "~/lib/ttl-cache";
import { directionsUrl } from "./maps-link";
import { computeRoute } from "./routes-api";
import type { Arrival, TravelAnswer, TravelLeg, TravelMode } from "./types";

export type { Arrival, TravelAnswer, TravelLeg, TravelMode } from "./types";
export { TRAVEL_MODES } from "./types";

/**
 * How long it takes to get somewhere, per way of going.
 *
 * Google's Routes API is the only thing here that knows about traffic and timetables, and the key
 * that reaches it is a server secret — so the app asks this instead of Google directly. Nothing
 * is stored: a journey is a question about right now, and the answer is stale within the hour.
 */

const MS_PER_MINUTE = 60_000;

/** Journeys don't change by the minute, and the same event is asked about on every reminder. */
const CACHE_MS = 10 * MS_PER_MINUTE;
const CACHE_MAX = 500;

/** Two reminders about the same 9am meeting are the same question. */
const ARRIVAL_BUCKET_MS = 15 * MS_PER_MINUTE;

/**
 * Keyed by account as well as by journey: an origin is often "where this phone is", and one
 * person's coordinates must never answer another's question.
 */
const legs = new TtlCache<TravelLeg | null>(CACHE_MS, CACHE_MAX);

/**
 * "2026-09-06T18:00:00+02:00" as the client writes it, keeping the offset it carries: the instant
 * is what Google is asked about, the offset is what the link it hands back is written in. A bare
 * UTC instant is taken as it is, with a clock at UTC.
 */
export function parseArrival(value: string | undefined): Arrival | undefined {
  if (!value) return undefined;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return undefined;
  const offset = /([+-])(\d\d):(\d\d)$/.exec(value);
  const offsetMinutes = offset ? (offset[1] === "-" ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
  return { at, offsetMinutes };
}

export async function travelTimes(input: {
  userId: string;
  origin: string;
  destination: string;
  modes: readonly TravelMode[];
  /** When you need to be there. Only transit can be asked to work backwards from it. */
  arriveBy?: Arrival;
}): Promise<TravelAnswer> {
  if (!input.origin.trim() || !input.destination.trim()) throw new ApiError("Both ends of the journey are needed");

  const answers = await Promise.all(
    input.modes.map((mode) => leg(input.userId, mode, input.origin, input.destination, input.arriveBy)),
  );
  return { available: true, legs: answers.filter((one): one is TravelLeg => one !== null) };
}

async function leg(
  userId: string,
  mode: TravelMode,
  origin: string,
  destination: string,
  arriveBy: Arrival | undefined,
): Promise<TravelLeg | null> {
  const bucket = arriveBy ? Math.round(arriveBy.at.getTime() / ARRIVAL_BUCKET_MS) : 0;
  const key = `${userId}|${mode}|${origin}|${destination}|${bucket}`;

  const hit = legs.get(key);
  if (hit !== undefined) return hit;

  const timed = await computeRoute(mode, origin, destination, arriveBy);
  const answer = timed ? { ...timed, url: directionsUrl(origin, destination, mode, arriveBy) } : null;
  legs.set(key, answer);
  return answer;
}
