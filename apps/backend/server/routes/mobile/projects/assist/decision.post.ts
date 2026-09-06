import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { assist } from "~/lib/projects/assist";

/** A proposal, never a write — see `lib/projects/assist`. `available: false` with no model. */
export default authed(
  {
    body: {
      project: z.string(),
      stage: z.string(),
      sentence: z.string(),
      count: z.number(),
      threshold: z.number(),
      measurable: z.boolean(),
      hoursInvested: z.number(),
      hoursPerWeek: z.number(),
      extended: z.boolean(),
      isLast: z.boolean(),
      checkpoints: z.array(z.object({ day: z.string(), count: z.number(), moved: z.boolean(), note: z.string() })),
    },
  },
  async ({ body }) => {
    const suggestion = await assist.decision(body);
    return suggestion ? { available: true as const, suggestion } : { available: false as const, suggestion: null };
  },
);
