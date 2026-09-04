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
