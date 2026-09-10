/**
 * What the model may answer with, and the one shape every ask comes back in. `available: false`
 * is a real answer: with no key configured, or a model that is down, every screen carries on.
 */
export interface Assisted<T> {
  available: boolean;
  suggestion: T | null;
}

/** A note over the week's deterministic fill, and what it would give less to. */
export interface WeekNote {
  note: string;
  drop: { projectId: string; hours: number; why: string }[];
}
