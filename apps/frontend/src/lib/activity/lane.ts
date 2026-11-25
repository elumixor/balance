import { addDays, MINUTES_PER_DAY, minutesIntoDay } from "$lib/calendar/dates";
import type { ActivityBasis, ActivitySegment } from "./types";

/** A stretch of the lane as one day's column draws it. */
export interface LaneMark {
  readonly key: string;
  readonly sphereId: string;
  readonly basis: ActivityBasis;
  readonly startMinutes: number;
  readonly endMinutes: number;
}

const SAID_BY: Record<ActivityBasis, string> = {
  manual: "set by you",
  source: "as reported",
  calendar: "from the calendar",
  place: "from where you were",
};

/** The parts of the lane that fall on `day`, in minutes from its local midnight. */
export function laneFor(segments: readonly ActivitySegment[], day: Date): LaneMark[] {
  const dayStart = day.getTime();
  const dayEnd = addDays(day, 1).getTime();
  return segments.flatMap((segment) => {
    const start = new Date(segment.start);
    const end = new Date(segment.end);
    if (end.getTime() <= dayStart || start.getTime() >= dayEnd) return [];
    return [
      {
        key: segment.start,
        sphereId: segment.sphereId,
        basis: segment.basis,
        startMinutes: start.getTime() <= dayStart ? 0 : minutesIntoDay(start),
        endMinutes: end.getTime() >= dayEnd ? MINUTES_PER_DAY : minutesIntoDay(end),
      },
    ];
  });
}

/** What a mark says when pointed at: "Work · 2h 15m · from where you were". */
export function laneTitle(mark: LaneMark, sphereName: string): string {
  const minutes = mark.endMinutes - mark.startMinutes;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const length = hours === 0 ? `${rest}m` : rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  return `${sphereName} · ${length} · ${SAID_BY[mark.basis]}`;
}
