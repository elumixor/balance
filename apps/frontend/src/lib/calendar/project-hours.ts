import type { CalendarEvent, Project } from "$lib/types";

const MS_PER_HOUR = 3_600_000;

export interface ProjectTotal {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly claimedHours: number;
  readonly actualHours: number;
}

/**
 * Hours on the week for each project, against what it claimed — the same arithmetic the server
 * does for the cards, run here so the rail answers a drag or a retro-tag at once. Only the
 * projects that claim hours or have some are listed: a row that says "0 of 0" says nothing.
 */
export function projectHours(
  events: readonly CalendarEvent[],
  projects: readonly Project[],
  weekStart: Date,
): ProjectTotal[] {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * MS_PER_HOUR);
  const actual = new Map<string, number>();

  for (const event of events) {
    if (!event.countsTowardHours || !event.projectId) continue;
    const start = Math.max(new Date(event.start).getTime(), weekStart.getTime());
    const end = Math.min(new Date(event.end).getTime(), weekEnd.getTime());
    if (end <= start) continue;
    actual.set(event.projectId, (actual.get(event.projectId) ?? 0) + (end - start) / MS_PER_HOUR);
  }

  return projects
    .filter((project) => project.status === "active" || project.status === "held")
    .map((project) => ({
      id: project.id,
      name: project.name,
      categoryId: project.categoryId,
      claimedHours: project.hoursPerWeek,
      actualHours: actual.get(project.id) ?? 0,
    }))
    .filter((total) => total.claimedHours > 0 || total.actualHours > 0);
}
