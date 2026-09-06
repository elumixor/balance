import { env } from "~/lib/env";
import { isNoAnswer } from "./google-maps";
import type { Arrival, TravelLeg, TravelMode } from "./types";

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Google's own names for the four ways of going. */
const ROUTES_MODE: Record<TravelMode, string> = {
  transit: "TRANSIT",
  drive: "DRIVE",
  bicycle: "BICYCLE",
  walk: "WALK",
};

const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1000;

/**
 * Traffic is only worth asking about for a journey that starts soon — past this, "now" is not a
 * useful stand-in for when you'd actually set off, and the free-flow estimate is the honest one.
 */
const TRAFFIC_HORIZON_MS = 60 * MS_PER_MINUTE;

/** A departure in the past is refused outright, and the request itself takes a moment. */
const DEPARTURE_SLACK_MS = 30 * MS_PER_SECOND;

const COORDINATES = /^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/;

export type TimedLeg = Omit<TravelLeg, "url">;

/**
 * Driving is asked twice when the meeting is later than the traffic horizon: once without
 * traffic, to learn roughly how long the road takes, and again with traffic predicted for the
 * moment you'd actually set off — which is the arrival less that first answer. Google can only be
 * asked about a departure, and "now" is the wrong departure for a six o'clock meeting.
 */
export async function computeRoute(
  mode: TravelMode,
  origin: string,
  destination: string,
  arriveBy: Arrival | undefined,
): Promise<TimedLeg | null> {
  const first = await ask(mode, origin, destination, timing(mode, arriveBy?.at));
  if (!first || mode !== "drive" || !arriveBy) return first;
  const departAt = new Date(arriveBy.at.getTime() - first.seconds * MS_PER_SECOND);
  if (departAt.getTime() - Date.now() < TRAFFIC_HORIZON_MS) return first;
  const predicted = await ask(mode, origin, destination, {
    routingPreference: "TRAFFIC_AWARE",
    departureTime: departAt.toISOString(),
  });
  return predicted ?? first;
}

async function ask(
  mode: TravelMode,
  origin: string,
  destination: string,
  when: Record<string, string>,
): Promise<TimedLeg | null> {
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
      ...when,
    }),
  });
  if (!response.ok && (await isNoAnswer(response, "routes"))) return null;

  const body = (await response.json()) as { routes?: { duration?: string; distanceMeters?: number }[] };
  const route = body.routes?.[0];
  if (!route?.duration) return null;

  return {
    mode,
    // Routes answers a duration as protobuf does — "1543s".
    seconds: Number.parseInt(route.duration, 10),
    meters: route.distanceMeters ?? 0,
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

/**
 * When the journey happens. Only transit can be asked to arrive by a time — every other mode
 * takes a departure, and a departure in the past is refused outright — so driving is asked about
 * with today's traffic when the meeting is soon, and without any traffic at all when it isn't.
 */
function timing(mode: TravelMode, arriveBy: Date | undefined): Record<string, string> {
  if (!arriveBy) return mode === "drive" ? { routingPreference: "TRAFFIC_AWARE" } : {};
  // A bus that has already left can't be asked about; a meeting that has started is planned from now.
  if (mode === "transit") return arriveBy.getTime() > Date.now() ? { arrivalTime: arriveBy.toISOString() } : {};
  if (mode !== "drive") return {};
  const soon = arriveBy.getTime() - Date.now() < TRAFFIC_HORIZON_MS;
  return soon
    ? { routingPreference: "TRAFFIC_AWARE", departureTime: new Date(Date.now() + DEPARTURE_SLACK_MS).toISOString() }
    : {};
}
