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
      note: z.string(),
    },
  },
  async ({ body }) => {
    const suggestion = await assist.checkpoint(body);
    return suggestion ? { available: true as const, suggestion } : { available: false as const, suggestion: null };
  },
);
