import type { PickerItem } from "$lib/components/Picker.svelte";
import { categories, practices, projects } from "$lib/core/synced.svelte";
import { restColor } from "$lib/ui/colors";
import { pathTo } from "./tree";

/** What an hour was for: a project, a practice, or nothing in particular. */
export interface Purpose {
  projectId: string | null;
  practiceId: string | null;
}

const PROJECT = "project";
const PRACTICE = "practice";

/** A purpose as one string, so a picker can name it the way it names anything else. */
export function purposeKey(purpose: { projectId?: string | null; practiceId?: string | null }) {
  if (purpose.projectId) return `${PROJECT}:${purpose.projectId}`;
  if (purpose.practiceId) return `${PRACTICE}:${purpose.practiceId}`;
  return "";
}

export function purposeOf(key: string): Purpose {
  const [kind, id] = key.split(":");
  return { projectId: kind === PROJECT ? id : null, practiceId: kind === PRACTICE ? id : null };
}

const colorOf = (categoryId: string) => categories.all.find((c) => c.id === categoryId)?.color ?? restColor;

/** Every live project and practice as picker rows, each in its sphere's colour. */
export function purposeItems(): PickerItem[] {
  return [
    ...projects.all
      .filter((p) => p.status === "active" || p.status === "paused")
      .map((p) => ({
        key: `${PROJECT}:${p.id}`,
        // Nested work needs its parents named, or two "Combat" rows are the same row.
        name: pathTo(projects.all, p.id)
          .map((one) => one.name || "Untitled")
          .join(" / "),
        color: colorOf(p.categoryId),
      })),
    ...practices.all.map((p) => ({
      key: `${PRACTICE}:${p.id}`,
      name: p.name || "Unnamed practice",
      color: colorOf(p.categoryId),
      practice: true,
    })),
  ];
}
