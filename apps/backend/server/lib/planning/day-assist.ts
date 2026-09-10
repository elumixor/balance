import { z } from "zod";
import { ask } from "~/lib/ai/gateway";

/**
 * The model's one moment on planning a day: a sentence of what the day is for, turned into
 * blocks on the grid — or, when the sentence is too thin to place with confidence, one question
 * back before it tries.
 *
 * Stateless like every other ask here: the route holds no conversation, the client resends the
 * transcript (`answers`) each turn, and `question` non-null means "show this, then call again
 * with the answer appended." A model that answers nothing leaves the day exactly as it was —
 * nothing is written until the person accepts the blocks and the calendar actually creates them.
 */

export interface DayPlanAssistInput {
  /** For the model's own sense of the day, e.g. "Wednesday 2026-09-10". */
  label: string;
  /** What the person typed. */
  prompt: string;
  /** The Q&A so far, oldest first. */
  answers: { question: string; answer: string }[];
  /** Already on the calendar that day — plan around these, never over them. */
  existing: { title: string; start: string; end: string }[];
  /** What a block can be tagged as, id first so the model can quote it back exactly. */
  activities: { id: string; name: string; categories: string }[];
  /** True once the client has decided this is the last turn — no more questions allowed. */
  final: boolean;
}

export const dayPlanAssistSchema = z.object({
  /**
   * Set only when the plan genuinely depends on something the person hasn't said. Options are
   * the pills they tap; the client sends the answer back with the next ask. Null on the turn
   * that answers with a plan instead.
   */
  question: z.object({ text: z.string(), options: z.array(z.string()).min(2).max(4) }).nullable(),
  /** One line on the shape of the day, shown above the blocks. Empty while still asking. */
  note: z.string(),
  /** Empty while still asking. `start`/`end` are "HH:mm" in the day's own clock. */
  blocks: z
    .array(
      z.object({
        title: z.string(),
        start: z.string(),
        end: z.string(),
        /** By id from the activities given — never invent one. */
        activityId: z.string(),
      }),
    )
    .max(12),
});

export type DayPlanAssist = z.infer<typeof dayPlanAssistSchema>;

const SYSTEM = `You help plan a day in a personal time-balance app called Balance. The person says in
their own words what the day is for; you turn that into a schedule of blocks, each tagged to one of
their activities. Plain words, second person, no exclamation marks, no coaching cliches, no emoji.
Never invent an activity id, and never place a block over one already on the calendar. You propose;
the person decides.`;

export function assistDayPlan(input: DayPlanAssistInput): Promise<DayPlanAssist | null> {
  const existing = input.existing.map((e) => `- ${e.start}–${e.end} ${e.title}`).join("\n") || "nothing yet";
  const activities = input.activities.map((a) => `- ${a.id} · ${a.name} · ${a.categories}`).join("\n") || "none";
  const answers =
    input.answers.length > 0
      ? `\nAnswers so far:\n${input.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n")}`
      : "";
  const ask_ = input.final
    ? "This is the last turn: question must be null, and you answer with the plan now, using your best judgement for anything still unclear."
    : "Ask one question, with 2-4 short options, only if the plan genuinely depends on something the person hasn't said; otherwise question is null and you answer with the plan.";

  const prompt = `Day being planned: ${input.label}.
What they want to do: "${input.prompt}"${answers}
Already on the calendar that day, fixed:
${existing}
Activities a block can be tagged as (id · name · what it counts toward):
${activities}
Propose realistic block times (HH:mm, 24h) covering what they described. Leave the rest of the day
open rather than padding it, and don't overlap the fixed events above or your own blocks. ${ask_}`;

  return ask({ schema: dayPlanAssistSchema, system: SYSTEM, prompt });
}
