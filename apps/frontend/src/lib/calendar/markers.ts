import type { Category } from "$lib/core/records";
import { checkpointsBetween } from "$lib/projects/decide-on";
import type { Project, Stage } from "$lib/projects/types";
import { restColor } from "$lib/ui/colors";

export type MarkerKind = "decision" | "checkpoint";

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
 * Every running stage's decision day, and its fortnightly checkpoints, as markers on the days
 * the strip holds. Decision days are the big ones; a checkpoint is a small tick — the calendar
 * is where the week is lived, and the day a bet is settled belongs on it.
 */
export function decisionMarkers(
  stages: readonly Stage[],
  projects: readonly Project[],
  categories: readonly Category[],
  stripStart: Date,
  dayCount: number,
): DayMarker[] {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const colorById = new Map(categories.map((c) => [c.id, c.color]));
  const markers: DayMarker[] = [];

  for (const stage of stages) {
    if (!stage.startedOn || !stage.decideOn || stage.outcome) continue;
    const project = projectById.get(stage.projectId);
    if (!project) continue;
    const color = colorById.get(project.categoryId) ?? restColor;
    const name = project.name || "Untitled project";
    const days: { day: string; kind: MarkerKind }[] = [
      ...checkpointsBetween(stage.startedOn, stage.decideOn).map((day) => ({ day, kind: "checkpoint" as const })),
      { day: stage.decideOn, kind: "decision" as const },
    ];
    for (const { day, kind } of days) {
      const dayIndex = dayIndexOfKey(day, stripStart);
      if (dayIndex < 0 || dayIndex >= dayCount) continue;
      markers.push({
        key: `${stage.id}:${day}`,
        projectId: project.id,
        label: kind === "decision" ? `Decide: ${name}` : name,
        kind,
        color,
        dayIndex,
      });
    }
  }

  return markers.sort((a, b) => a.dayIndex - b.dayIndex || RANK[a.kind] - RANK[b.kind]);
}

/** A decision draws first on a day that also has a checkpoint. */
const RANK: Record<MarkerKind, number> = { decision: 0, checkpoint: 1 };
