import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { dayField } from "~/lib/http/schemas";
import { assistDayPlan } from "~/lib/planning/day-assist";

const MAX_TEXT = 2000;

/** A proposal, never a write — see `lib/planning/day-assist`. `available: false` with no model. */
export default authed(
  {
    body: {
      day: dayField,
      weekday: z.string().max(20),
      prompt: z.string().max(MAX_TEXT),
      answers: z.array(z.object({ question: z.string().max(300), answer: z.string().max(300) })).max(5),
      existing: z
        .array(z.object({ title: z.string().max(200), start: z.string().max(5), end: z.string().max(5) }))
        .max(50),
      activities: z
        .array(z.object({ id: z.uuid(), name: z.string().max(200), categories: z.string().max(200) }))
        .max(100),
      final: z.boolean(),
    },
  },
  async ({ body }) => {
    const plan = await assistDayPlan({ ...body, label: `${body.weekday} ${body.day}` });
    return plan ? { available: true as const, plan } : { available: false as const, plan: null };
  },
);
