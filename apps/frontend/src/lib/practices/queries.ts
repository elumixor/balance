import { apiGet } from "$lib/core/api";
import type { Progress } from "./types";

/** The device's day and zone travel with the ask, the same way the planning sessions send theirs. */
export const getPracticeProgress = (timeZone: string, today: string) =>
  apiGet<Progress>("/practices/progress", { timeZone, today });
