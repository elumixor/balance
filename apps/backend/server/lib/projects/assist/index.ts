import {
  ask,
  type CheckpointInput,
  type CreateInput,
  type DecisionInput,
  type EventInput,
  prompts,
  type WeekInput,
} from "./prompts";
import {
  checkpointHelpSchema,
  createSuggestionSchema,
  decisionAdviceSchema,
  eventPlanSchema,
  weekNoteSchema,
} from "./schemas";

/**
 * The model's six moments, all of them proposals: words, estimates and judgement, handed back
 * for a person to press a button on. Nothing here writes a record, moves a date, marks a gate or
 * sets an outcome — the routes only return what these return — and with no key configured every
 * answer is `{ available: false }`, which every screen already copes with.
 */

export const assist = {
  /** A vague idea into two or three countable gate sentences, a template, a rate and a budget. */
  create(input: CreateInput) {
    return ask(createSuggestionSchema, prompts.create(input));
  },

  /** What to drop when the week is short, as a note over a deterministic fill. */
  week(input: WeekInput) {
    return ask(weekNoteSchema, prompts.week(input));
  },

  /** Names what stopped a stage, and breaks it into estimated subtasks. */
  checkpoint(input: CheckpointInput) {
    return ask(checkpointHelpSchema, prompts.checkpoint(input));
  },

  /** A recommendation on decision day, with the why. The person presses the button. */
  decision(input: DecisionInput) {
    return ask(decisionAdviceSchema, prompts.decision(input));
  },

  /**
   * A calendar block into a plan: which project it serves, which task it is, the steps inside it,
   * and how long it wants to be. One question at a time when the block is too vague to answer.
   */
  event(input: EventInput) {
    return ask(eventPlanSchema, prompts.event(input));
  },
};
