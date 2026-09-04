import { ApiError } from "../api-error";
import { env } from "../env";

/**
 * How long it takes to get somewhere, per way of going.
 *
 * Google's Routes API is the only thing here that knows about traffic and timetables, and the key
 * that reaches it is a server secret — so the app asks this instead of Google directly. Nothing
 * is stored: a journey is a question about right now, and the answer is stale within the hour.
 */

export const TRAVEL_MODES = ["transit", "drive", "bicycle", "walk"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export interface TravelLeg {
  readonly mode: TravelMode;
  /** How long the journey takes, door to door. */
  readonly seconds: number;
  readonly meters: number;
  /** Google Maps, opened on this route in whatever the machine treats as a maps link. */
  readonly url: string;
}

export interface TravelAnswer {
  /** False when there was nowhere to leave from — the app then simply doesn't offer travel times. */
  readonly available: boolean;
  readonly legs: TravelLeg[];
}

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Google's own names for the four ways of going. */
const ROUTES_MODE: Record<TravelMode, string> = {
  transit: "TRANSIT",
  drive: "DRIVE",
  bicycle: "BICYCLE",
  walk: "WALK",
};

/** What `travelmode=` wants in a maps link, which is a different spelling of the same four. */
const LINK_MODE: Record<TravelMode, string> = {
  transit: "transit",
  drive: "driving",
  bicycle: "bicycling",
  walk: "walking",
};

/**
 * Traffic is only worth asking about for a journey that starts soon — past this, "now" is not a
 * useful stand-in for when you'd actually set off, and the free-flow estimate is the honest one.
 */
const TRAFFIC_HORIZON_MS = 60 * 60_000;

/** Journeys don't change by the minute, and the same event is asked about on every reminder. */
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;

const cache = new Map<string, { at: number; leg: TravelLeg | null }>();

export async function travelTimes(input: {
  origin: string;
  destination: string;
  modes: readonly TravelMode[];
  /** When you need to be there. Only transit can be asked to work backwards from it. */
  arriveBy?: Date;
}): Promise<TravelAnswer> {
  if (!input.origin.trim() || !input.destination.trim()) throw new ApiError("Both ends of the journey are needed");

  const legs = await Promise.all(input.modes.map((mode) => leg(mode, input.origin, input.destination, input.arriveBy)));
  return { available: true, legs: legs.filter((one): one is TravelLeg => one !== null) };
}

/** A maps link for a journey, whether or not Google would tell us how long it takes. */
export function directionsUrl(origin: string, destination: string, mode: TravelMode) {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: LINK_MODE[mode],
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

async function leg(
  mode: TravelMode,
  origin: string,
  destination: string,
  arriveBy: Date | undefined,
): Promise<TravelLeg | null> {
  // Rounded to the quarter hour: two reminders about the same 9am meeting are the same question.
  const bucket = arriveBy ? Math.round(arriveBy.getTime() / (15 * 60_000)) : 0;
  const key = `${mode}|${origin}|${destination}|${bucket}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.leg;

  const answer = await compute(mode, origin, destination, arriveBy);
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), leg: answer });
  return answer;
}

async function compute(
  mode: TravelMode,
  origin: string,
  destination: string,
  arriveBy: Date | undefined,
): Promise<TravelLeg | null> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GOOGLE_MAPS_API_KEY,
      // Routes refuses a request that doesn't say what it wants back, and charges by how much
      // it is. Two numbers is the whole answer here.
      "x-goog-fieldmask": "routes.duration,routes.distanceMeters",
    },
    body: JSON.stringify({
      origin: waypoint(origin),
      destination: waypoint(destination),
      travelMode: ROUTES_MODE[mode],
      ...timing(mode, arriveBy),
    }),
  });

  if (!response.ok) {
    // An address Google can't place, or a journey it won't route, is a normal answer for a
    // calendar event whose location is "Room 4" — the app shows nothing rather than an error.
    if (response.status === 400 || response.status === 404) return null;
    // A key that isn't allowed to ask — no billing on the project, the wrong restriction — is a
    // configuration problem, not something the person looking at a calendar can act on. It is
    // the same outcome for them as having no key at all, so it reads as one.
    if (response.status === 401 || response.status === 403) return null;
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ApiError(`Google Maps said: ${body.error?.message ?? response.statusText}`, 502);
  }

  const body = (await response.json()) as { routes?: { duration?: string; distanceMeters?: number }[] };
  const route = body.routes?.[0];
  if (!route?.duration) return null;

  return {
    mode,
    // Routes answers a duration as protobuf does — "1543s".
    seconds: Number.parseInt(route.duration, 10),
    meters: route.distanceMeters ?? 0,
    url: directionsUrl(origin, destination, mode),
  };
}

/** Somewhere Google can be asked about: a pair of coordinates when the phone gave us one, and
 * otherwise an address in words. "Where I am now" has no street name, so it travels as
 * "50.0755,14.4378" and is recognised here rather than being sent as a nonsense address. */
function waypoint(value: string) {
  const point = COORDINATES.exec(value.trim());
  if (!point) return { address: value };
  return { location: { latLng: { latitude: Number(point[1]), longitude: Number(point[2]) } } };
}

const COORDINATES = /^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/;

/**
 * When the journey happens. Only transit can be asked to arrive by a time — every other mode
 * takes a departure, and a departure in the past is refused outright — so driving is asked about
 * with today's traffic when the meeting is soon, and without any traffic at all when it isn't.
 */
function timing(mode: TravelMode, arriveBy: Date | undefined) {
  if (!arriveBy) return mode === "drive" ? { routingPreference: "TRAFFIC_AWARE" } : {};
  if (mode === "transit") return { arrivalTime: arriveBy.toISOString() };
  if (mode !== "drive") return {};
  const soon = arriveBy.getTime() - Date.now() < TRAFFIC_HORIZON_MS;
  // A departure in the past is refused outright, and the request itself takes a moment, so "now"
  // is asked for as half a minute from now.
  return soon ? { routingPreference: "TRAFFIC_AWARE", departureTime: new Date(Date.now() + 30_000).toISOString() } : {};
}
