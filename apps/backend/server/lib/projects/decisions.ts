import { addDays, type Day, daysBetween } from "../planning/days";

/** The one extension a stage may take: a named fix, two weeks, once. */
export const EXTENSION_DAYS = 14;
/** How often a stage is looked at between its start and its decision. */
export const CHECKPOINT_DAYS = 14;
/** A stage with no budget still gets a date — the window has to be able to close first. */
const MIN_STAGE_DAYS = 7;
const DAYS_PER_WEEK = 7;

export interface DateInput {
  readonly startedOn: Day;
  readonly budgetHours: number;
  readonly hoursPerWeek: number;
  readonly windowDays: number;
  /** A delivery takes the date it was given rather than working one out. */
  readonly deadline?: Day | null;
}

/**
 * When a stage is decided: the day its budget runs out at the project's rate, and never before
 * the gate's window could have closed. The rate is the only lever — a project at one hour a week
 * lands later than one at eight, and that is the whole of how faster and slower work.
 *
 * A project with no hours claimed is not a project moving at all, so its stage still gets a
 * near date rather than one at infinity: the decision then is what those hours should be.
 */
export function decideOnFor(input: DateInput): Day {
  if (input.deadline) return input.deadline;
  const weeks = input.hoursPerWeek > 0 ? input.budgetHours / input.hoursPerWeek : 0;
  const byBudget = Math.ceil(weeks * DAYS_PER_WEEK);
  return addDays(input.startedOn, Math.max(byBudget, input.windowDays, MIN_STAGE_DAYS));
}

/** The date after the one extension — the only way a decision date ever moves. */
export function extendedDecideOn(decideOn: Day): Day {
  return addDays(decideOn, EXTENSION_DAYS);
}

/** Every fortnight from the start up to, but not on, the decision day. */
export function checkpointsBetween(startedOn: Day, decideOn: Day): Day[] {
  const days: Day[] = [];
  for (let at = addDays(startedOn, CHECKPOINT_DAYS); daysBetween(at, decideOn) > 0; at = addDays(at, CHECKPOINT_DAYS)) {
    days.push(at);
  }
  return days;
}

/**
 * The checkpoint that is owed: the latest one that has come round, unless it has been looked at.
 * Older ones that were skipped are not owed as well — the question is "did it move", and the
 * newest number is the only one that can answer it.
 */
export function dueCheckpoint(input: {
  startedOn: Day;
  decideOn: Day;
  today: Day;
  looked: readonly Day[];
}): Day | null {
  const latest = checkpointsBetween(input.startedOn, input.decideOn)
    .filter((day) => daysBetween(day, input.today) >= 0)
    .at(-1);
  return latest && !input.looked.includes(latest) ? latest : null;
}
