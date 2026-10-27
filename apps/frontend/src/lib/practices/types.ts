/** Something recurring that never completes, measured only by whether it kept happening. */
export interface Practice {
  id: string;
  categoryId: string;
  name: string;
  unit: "times" | "hours";
  targetPerWeek: number;
}

export interface PracticeProgress {
  byWeek: number[];
  adherence: number;
}

/** The calendar's answer to every practice at once — `/mobile/practices/progress`. */
export interface Progress {
  connected: boolean;
  needsReconnect: boolean;
  /** The Monday of each column, `YYYY-MM-DD`. */
  weeks: string[];
  practices: Record<string, PracticeProgress>;
}
