import { ask, type EventInput, prompts, type WeekInput } from "./prompts";
import { eventPlanSchema, weekNoteSchema } from "./schemas";

/**
 * The model's two moments, both of them proposals: words and estimates, handed back for a person
 * to press a button on. Nothing here writes a record — the routes only return what these return —
 * and with no key configured every answer is `{ available: false }`, which every screen copes with.
 */

export const assist = {
  /** What to drop when the week is short, as a note over a deterministic fill. */
  week(input: WeekInput) {
    return ask(weekNoteSchema, prompts.week(input));
  },

  /**
   * A calendar block into a plan: which project it serves, which task it is, the steps inside it,
   * and how long it wants to be. One question at a time when the block is too vague to answer.
   */
  event(input: EventInput) {
    return ask(eventPlanSchema, prompts.event(input));
  },
};
