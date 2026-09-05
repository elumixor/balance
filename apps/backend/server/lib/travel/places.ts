import { ApiError } from "../api-error";
import { env } from "../env";

/**
 * Addresses, as you type them.
 *
 * A journey is only as good as the address it starts from, and "Kolbenova 942/38a" typed from
 * memory is not one Google will route from. So the app never asks anyone to spell a place: it
 * suggests, and what gets saved is the address the maps API itself returned.
 *
 * The same key as the Routes API, so this lives behind the session for the same reason — the
 * answer isn't private, the quota is. Nothing is stored: a suggestion is only true while it is
 * being chosen.
 */

const ENDPOINT = "https://places.googleapis.com/v1/places:autocomplete";

export interface PlaceSuggestion {
  /** Google's own id for the place — kept so a later build can ask for its coordinates. */
  readonly placeId: string;
  /** The name of the place: "Prague Castle", or the street line of an address. */
  readonly name: string;
  /** Where it is, in words: the rest of the address. Empty when the name is the whole of it. */
  readonly detail: string;
  /** What goes to the Routes API, and what the app shows once it has been chosen. */
  readonly address: string;
}

/**
 * Everything typed since the field was opened is one session as far as Google's billing is
 * concerned, and the client makes the token — which is why it is passed through rather than
 * invented here.
 */
export async function suggestPlaces(input: { query: string; sessionToken?: string }): Promise<PlaceSuggestion[]> {
  const query = input.query.trim();
  // Two letters is not a question; asking anyway would spend a request per keystroke on nothing.
  if (query.length < 3) return [];

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GOOGLE_MAPS_API_KEY,
    },
    body: JSON.stringify({ input: query, ...(input.sessionToken ? { sessionToken: input.sessionToken } : {}) }),
  });

  if (!response.ok) {
    // The same reasoning as a journey Google won't route: a key that isn't allowed to ask is a
    // configuration problem, and for the person typing it is indistinguishable from no matches.
    if (response.status === 400 || response.status === 401 || response.status === 403) return [];
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ApiError(`Google Maps said: ${body.error?.message ?? response.statusText}`, 502);
  }

  const body = (await response.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }[];
  };

  return (body.suggestions ?? [])
    .map((one) => one.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId))
    .map((prediction) => {
      const address = prediction.text?.text ?? "";
      const name = prediction.structuredFormat?.mainText?.text ?? address;
      return {
        placeId: prediction.placeId as string,
        name,
        detail: prediction.structuredFormat?.secondaryText?.text ?? "",
        address: address || name,
      };
    })
    .filter((suggestion) => suggestion.address.length > 0);
}

/** Where a place is, precisely enough to draw it and to route from it. */
export interface PlaceDetails {
  readonly placeId: string | null;
  /** The address as Google spells it — the one worth saving. */
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
}

const DETAILS_FIELDS = "id,formattedAddress,location";

/**
 * A place, pinned down: by Google's id when a suggestion was chosen, or by searching for the
 * address in words when it was typed — a calendar event's location is words. Null when Google
 * knows no such place, which is a normal answer for "Room 4".
 */
export async function lookupPlace(input: {
  placeId?: string;
  address?: string;
  sessionToken?: string;
}): Promise<PlaceDetails | null> {
  if (input.placeId) return await placeById(input.placeId, input.sessionToken);
  const address = input.address?.trim();
  if (!address) return null;
  return await placeByText(address);
}

interface RawPlace {
  id?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

function asDetails(place: RawPlace | undefined): PlaceDetails | null {
  if (!place?.location || place.location.latitude === undefined || place.location.longitude === undefined) return null;
  return {
    placeId: place.id ?? null,
    address: place.formattedAddress ?? "",
    latitude: place.location.latitude,
    longitude: place.location.longitude,
  };
}

async function placeById(placeId: string, sessionToken: string | undefined) {
  const params = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${params}`, {
    headers: { "x-goog-api-key": env.GOOGLE_MAPS_API_KEY, "x-goog-fieldmask": DETAILS_FIELDS },
  });
  if (!response.ok) return await noPlace(response);
  return asDetails((await response.json()) as RawPlace);
}

async function placeByText(query: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GOOGLE_MAPS_API_KEY,
      "x-goog-fieldmask": DETAILS_FIELDS.split(",")
        .map((field) => `places.${field}`)
        .join(","),
    },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
  });
  if (!response.ok) return await noPlace(response);
  const body = (await response.json()) as { places?: RawPlace[] };
  return asDetails(body.places?.[0]);
}

async function noPlace(response: Response): Promise<null> {
  if ([400, 401, 403, 404].includes(response.status)) return null;
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  throw new ApiError(`Google Maps said: ${body.error?.message ?? response.statusText}`, 502);
}

/** The picture is the same for the life of an address; a day is long enough not to matter. */
const MAP_CACHE_MS = 24 * 60 * 60_000;
const MAP_CACHE_MAX = 200;
const mapCache = new Map<string, { at: number; image: string }>();

/**
 * A small map with a pin on the place, as a data URL. Proxied rather than linked because the
 * Static Maps key would otherwise sit in an `<img src>` for anyone to read — and an image can't
 * carry the session header every other request does.
 */
export async function staticMap(input: { latitude: number; longitude: number; width: number; height: number }) {
  const key = `${input.latitude.toFixed(5)},${input.longitude.toFixed(5)}|${input.width}x${input.height}`;
  const hit = mapCache.get(key);
  if (hit && Date.now() - hit.at < MAP_CACHE_MS) return hit.image;

  const params = new URLSearchParams({
    center: `${input.latitude},${input.longitude}`,
    zoom: "15",
    size: `${input.width}x${input.height}`,
    scale: "2",
    markers: `color:0x111111|${input.latitude},${input.longitude}`,
    key: env.GOOGLE_MAPS_API_KEY,
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params}`);
  if (!response.ok) return null;
  const image = `data:${response.headers.get("content-type") ?? "image/png"};base64,${Buffer.from(
    await response.arrayBuffer(),
  ).toString("base64")}`;

  if (mapCache.size >= MAP_CACHE_MAX) {
    const oldest = mapCache.keys().next().value;
    if (oldest !== undefined) mapCache.delete(oldest);
  }
  mapCache.set(key, { at: Date.now(), image });
  return image;
}
