import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { assist } from "../../../../lib/projects/assist";

/** A proposal, never a write — see `lib/projects/assist.ts`. `available: false` with no model. */
export default handler(
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
  async ({ body, event }) => {
    await getDbUserForRequest(event);
    try {
      const suggestion = await assist.checkpoint(body);
      return suggestion ? { available: true as const, suggestion } : { available: false as const, suggestion: null };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
