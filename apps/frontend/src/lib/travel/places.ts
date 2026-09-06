import { api, callApi, unwrapOk } from "$lib/core/api";

/** One address Google recognises, as it is offered while somebody types. */
export interface PlaceSuggestion {
  placeId: string;
  /** The street line, or the name of the place. */
  name: string;
  /** The rest of the address — the city, the country. */
  detail: string;
  /** What gets saved and what journeys are asked about. */
  address: string;
}

/**
 * Addresses matching what has been typed.
 *
 * The maps key is the server's, so this is a request rather than Google's own widget — which also
 * means the field keeps working, silently unhelpful, on a server with no key at all.
 */
export const suggestPlaces = (input: { query: string; sessionToken?: string }) =>
  callApi(api.travel.places.$post(input)).then((r) => (unwrapOk(r) as { suggestions: PlaceSuggestion[] }).suggestions);

/** A place pinned down: where it is, how Google spells it, and a small map with a pin on it. */
export interface PlaceDetails {
  placeId: string | null;
  address: string;
  latitude: number;
  longitude: number;
}

const lookups = new Map<string, Promise<PlaceDetails | null>>();

/**
 * One place, asked about once per session: a saved address is looked up on every card it appears
 * on, and the answer — where a street is — does not change between them. A lookup that fails is
 * forgotten, so the next card asks again rather than inheriting a blank.
 */
export function lookupPlace(input: { placeId?: string | null; address?: string; sessionToken?: string }) {
  const key = input.placeId ? `id:${input.placeId}` : `q:${input.address?.trim().toLowerCase() ?? ""}`;
  const hit = lookups.get(key);
  if (hit) return hit;
  const asked = callApi(
    api.travel.place.$post({
      ...(input.placeId ? { placeId: input.placeId } : { address: input.address }),
      ...(input.sessionToken ? { sessionToken: input.sessionToken } : {}),
    }),
  )
    .then((r) => (unwrapOk(r) as { place: PlaceDetails | null }).place)
    .catch((e) => {
      lookups.delete(key);
      throw e;
    });
  lookups.set(key, asked);
  return asked;
}

/** Google Maps opened on the place itself — what tapping the preview does. */
export function placeUrl(place: { placeId?: string | null; address: string }) {
  const params = new URLSearchParams({ api: "1", query: place.address });
  if (place.placeId) params.set("query_place_id", place.placeId);
  return `https://www.google.com/maps/search/?${params}`;
}

/** The size every preview is drawn at, so two screens asking about one address share a picture. */
export const MAP_PREVIEW = { width: 320, height: 140 } as const;

const maps = new Map<string, Promise<string | null>>();

/**
 * A small map around a point, as a data URL, asked once per session per point and theme. Null
 * when Google wouldn't draw one — the card then shows the address alone.
 */
export function mapAround(input: { latitude: number; longitude: number; dark: boolean }) {
  const key = `${input.latitude.toFixed(5)},${input.longitude.toFixed(5)}|${input.dark}`;
  const hit = maps.get(key);
  if (hit) return hit;
  const asked = callApi(api.travel.map.$post({ ...input, ...MAP_PREVIEW }))
    .then((r) => (unwrapOk(r) as { image: string | null }).image)
    .catch((e) => {
      maps.delete(key);
      throw e;
    });
  maps.set(key, asked);
  return asked;
}
