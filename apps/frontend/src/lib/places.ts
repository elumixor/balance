import { api, callApi, unwrapOk } from "./api";

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
