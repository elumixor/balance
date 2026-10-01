import type { Category } from "$lib/core/records";
import type { Project, Stage, Task } from "$lib/projects/types";
import { restColor } from "$lib/ui/colors";
import { packRows } from "./week-grid";

export type MarkerKind = "stage" | "task";

/**
 * Days on the strip that a project has something to say about — drawn under the day headings. A
 * stage ending is one day; a task runs from its first day to its last, and overlapping ones are
 * given rows of their own so no two are drawn over each other.
 */
export interface DayMarker {
  readonly key: string;
  readonly projectId: string;
  readonly label: string;
  readonly kind: MarkerKind;
  readonly color: string;
  readonly dayIndex: number;
  readonly days: number;
  readonly row: number;
}

const DAY_MS = 86_400_000;

/** Days from the strip's first day to a `YYYY-MM-DD`, in the strip's own local zone. */
function dayIndexOfKey(day: string, stripStart: Date) {
  const [year, month, date] = day.split("-").map(Number);
  const at = new Date(year, month - 1, date);
  const start = new Date(stripStart.getFullYear(), stripStart.getMonth(), stripStart.getDate());
  return Math.round((at.getTime() - start.getTime()) / DAY_MS);
}

/**
 * The days work happens on: a stage ending, and every open task across the days it runs. The
 * calendar is where the week is lived, and a day something is due on belongs on it rather than
 * only on a timeline somebody has to go and look at.
 */
export function dueMarkers(
  stages: readonly Stage[],
  tasks: readonly Task[],
  projects: readonly Project[],
  categories: readonly Category[],
  stripStart: Date,
  dayCount: number,
): DayMarker[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const colorById = new Map(categories.map((category) => [category.id, category.color]));
  const markers: Omit<DayMarker, "row">[] = [];

  const add = (
    key: string,
    projectId: string,
    from: string | null,
    to: string | null,
    kind: MarkerKind,
    label: (name: string) => string,
  ) => {
    const project = projectById.get(projectId);
    const ends = [from, to].filter((day) => day !== null).map((day) => dayIndexOfKey(day, stripStart));
    if (ends.length === 0 || !project) return;
    // A range written backwards still covers the days between its two ends.
    const first = Math.min(...ends);
    const end = Math.max(...ends);
    if (end < 0 || first >= dayCount) return;
    const dayIndex = Math.max(0, first);
    markers.push({
      key,
      projectId,
      label: label(project.name || "Untitled project"),
      kind,
      color: colorById.get(project.categoryId) ?? restColor,
      dayIndex,
      days: Math.min(dayCount - 1, end) - dayIndex + 1,
    });
  };

  for (const stage of stages)
    add(`stage:${stage.id}`, stage.projectId, null, stage.endsOn, "stage", (name) => `${name} · ${stage.name} ends`);
  for (const task of tasks) {
    if (task.status === "done" || task.status === "dropped") continue;
    add(`task:${task.id}`, task.projectId, task.startsOn, task.endsOn, "task", () => task.title || "Untitled task");
  }

  return packRows(markers.sort((a, b) => a.dayIndex - b.dayIndex || RANK[a.kind] - RANK[b.kind] || b.days - a.days));
}

/** A stage ending draws first on a day that also has a task starting. */
const RANK: Record<MarkerKind, number> = { stage: 0, task: 1 };
