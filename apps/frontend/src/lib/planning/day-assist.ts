export interface DayPlanQuestion {
  text: string;
  options: string[];
}

export interface DayPlanBlock {
  title: string;
  /** "HH:mm" in the day's own clock. */
  start: string;
  end: string;
  activityId: string;
}

export interface DayPlanAssist {
  question: DayPlanQuestion | null;
  note: string;
  blocks: DayPlanBlock[];
}

/** `available: false` is the whole answer when no model is configured or it is down. */
export type Assisted<T> = { available: true; plan: T } | { available: false; plan: null };
