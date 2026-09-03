import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { assist } from "../../../../lib/projects/assist";

/** A proposal, never a write — see `lib/projects/assist.ts`. `available: false` with no model. */
export default handler(
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
          stage: z.string(),
          sentence: z.string(),
          hoursPerWeek: z.number(),
          tasks: z.array(
            z.object({ id: z.string(), title: z.string(), estimateHours: z.number().nullable(), done: z.boolean() }),
          ),
        })
        .nullable(),
      candidates: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
      answers: z.array(z.object({ question: z.string(), answer: z.string() })),
    },
  },
  async ({ body, event }) => {
    await getDbUserForRequest(event);
    try {
      const suggestion = await assist.event(body);
      return suggestion ? { available: true as const, suggestion } : { available: false as const, suggestion: null };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
