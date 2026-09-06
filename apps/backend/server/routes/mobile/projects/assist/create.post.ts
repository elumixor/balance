import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { assist } from "~/lib/projects/assist";

/** A proposal, never a write — see `lib/projects/assist`. `available: false` with no model. */
export default authed(
  {
    body: { idea: z.string().min(1), sphere: z.string(), existingProjects: z.array(z.string()) },
  },
  async ({ body }) => {
    const suggestion = await assist.create(body);
    return suggestion ? { available: true as const, suggestion } : { available: false as const, suggestion: null };
  },
);
