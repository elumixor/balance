import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { assist } from "~/lib/projects/assist";

/** A proposal, never a write — see `lib/projects/assist`. `available: false` with no model. */
export default authed(
  {
    body: {
      title: z.string(),
      description: z.string(),
      hours: z.number(),
      sphere: z.string(),
      project: z
        .object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          stage: z.string().nullable(),
          hoursPerWeek: z.number(),
          tasks: z.array(
            z.object({ id: z.string(), title: z.string(), estimateHours: z.number().nullable(), open: z.boolean() }),
          ),
        })
        .nullable(),
      candidates: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
      answers: z.array(z.object({ question: z.string(), answer: z.string() })),
    },
  },
  async ({ body }) => {
    const suggestion = await assist.event(body);
    return suggestion ? { available: true as const, suggestion } : { available: false as const, suggestion: null };
  },
);
