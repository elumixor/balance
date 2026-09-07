import { z } from "zod";
import { ask } from "~/lib/ai/gateway";

/**
 * The model's one moment on the calendar so far: a guess at where an event leaves you.
 *
 * "Bus to Prague (Bus Terminal Černý Most)" ends in Prague, and a person should not have to type
 * that in. The guess is a proposal like every other ask — the route returns it, the card writes
 * it only when the person accepts, and a model that answers nothing leaves the row as it was.
 */

export interface EndPlaceInput {
  title: string;
  description: string;
  /** Where the event itself is, as the invitation spells it, or null. */
  location: string | null;
  /** The places the person has named, so a guess can land on one of them exactly. */
  places: { label: string; address: string }[];
}

export const endPlaceGuessSchema = z.object({
  /**
   * Where the person is once the event is over, as something Google Maps can find — a saved
   * place's exact address, a station, a city. Null when the event leaves them where they were.
   */
  address: z.string().nullable(),
});

export type EndPlaceGuess = z.infer<typeof endPlaceGuessSchema>;

const SYSTEM = `You help a calendar app plan journeys. Given one event, say where the person is once
it is over. Most events — a meeting, a class, dinner — leave them where they were: answer null for
those. A journey — a bus, a train, a flight, a drive somewhere, a move — leaves them at its
destination: answer with that place, as an address or a place name that Google Maps can find,
taken from the event's own words. When the destination is one of the person's saved places, answer
with that place's exact address. Never invent a place the event does not name.`;

export function guessEndPlace(input: EndPlaceInput): Promise<EndPlaceGuess | null> {
  const places = input.places.map((p) => `- ${p.label}: ${p.address}`).join("\n") || "none";
  const prompt = `Event: "${input.title}"
Location: ${input.location ?? "none"}
Notes: "${input.description || "none"}"
Saved places (name: address):
${places}`;
  return ask({ schema: endPlaceGuessSchema, system: SYSTEM, prompt });
}
