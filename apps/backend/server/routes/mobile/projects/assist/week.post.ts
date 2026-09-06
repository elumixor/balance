import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { assist } from "~/lib/projects/assist";

/** A proposal, never a write — see `lib/projects/assist`. `available: false` with no model. */
export default authed(
  {
    body: {
      freeHours: z.number(),
      projects: z.array(
        z.object({ id: z.string(), name: z.string(), claimed: z.number(), logged: z.number(), priority: z.number() }),
      ),
      fixed: z.array(z.string()),
    },
  },
  async ({ body }) => {
    const suggestion = await assist.week(body);
    return suggestion ? { available: true as const, suggestion } : { available: false as const, suggestion: null };
  },
);
