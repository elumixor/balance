import { z } from "zod";
import { guessEndPlace } from "~/lib/calendar/assist";
import { authed } from "~/lib/http/authed";

const MAX_TEXT = 4000;
const MAX_PLACES = 50;

/** A proposal, never a write — see `lib/calendar/assist`. `available: false` with no answer. */
export default authed(
  {
    body: {
      title: z.string().max(MAX_TEXT),
      description: z.string().max(MAX_TEXT),
      location: z.string().max(MAX_TEXT).nullable(),
      places: z.array(z.object({ label: z.string().max(200), address: z.string().max(500) })).max(MAX_PLACES),
    },
  },
  async ({ body }) => {
    const suggestion = await guessEndPlace(body);
    return suggestion ? { available: true as const, suggestion } : { available: false as const, suggestion: null };
  },
);
