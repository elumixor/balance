import type { Category } from "$lib/core/records";
import type { Project, Stage, Task } from "$lib/projects/types";
import { restColor } from "$lib/ui/colors";

export type MarkerKind = "stage" | "task";

/** A day on the strip that a project has something to say about — drawn in the all-day row. */
export interface DayMarker {
  readonly key: string;
  readonly projectId: string;
  readonly label: string;
  readonly kind: MarkerKind;
  readonly color: string;
  readonly dayIndex: number;
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
 * The days work is due on: a stage ending, and every open task's last day. The calendar is where
 * the week is lived, and a day something is due on belongs on it rather than only on a timeline
 * somebody has to go and look at.
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
  const markers: DayMarker[] = [];

  const add = (
    key: string,
    projectId: string,
    day: string | null,
    kind: MarkerKind,
    label: (name: string) => string,
  ) => {
    const project = projectById.get(projectId);
    if (!day || !project) return;
    const dayIndex = dayIndexOfKey(day, stripStart);
    if (dayIndex < 0 || dayIndex >= dayCount) return;
    markers.push({
      key,
      projectId,
      label: label(project.name || "Untitled project"),
      kind,
      color: colorById.get(project.categoryId) ?? restColor,
      dayIndex,
    });
  };

  for (const stage of stages)
    add(`stage:${stage.id}`, stage.projectId, stage.endsOn, "stage", (name) => `${name} · ${stage.name} ends`);
  for (const task of tasks) {
    if (task.status === "done" || task.status === "dropped") continue;
    add(`task:${task.id}`, task.projectId, task.endsOn, "task", () => task.title || "Untitled task");
  }

  return markers.sort((a, b) => a.dayIndex - b.dayIndex || RANK[a.kind] - RANK[b.kind]);
}

/** A stage ending draws first on a day that also has a task due. */
const RANK: Record<MarkerKind, number> = { stage: 0, task: 1 };
