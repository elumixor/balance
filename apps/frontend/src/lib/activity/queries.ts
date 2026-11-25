import { apiGet } from "$lib/core/api";
import type { ActivityTimeline } from "./types";

/** What actually happened between two instants, already settled into one sphere per stretch. */
export const getActivityTimeline = (from: string, to: string) => apiGet<ActivityTimeline>("/activity", { from, to });
