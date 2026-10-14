import type { PickerItem } from "$lib/components/Picker.svelte";
import type { Category } from "$lib/core/records";
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
const CATEGORY = "category";

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

/**
 * What an hour counts as and what it was for, as one list: each sphere, with its projects and
 * practices under it, so the card asks one question rather than two. A row whose sphere isn't
 * on offer still comes last, unindented, rather than vanishing.
 */
export function filingItems(spheres: readonly Category[]): PickerItem[] {
  const work = purposeItems();
  const sphereOf = (key: string) => {
    const { projectId, practiceId } = purposeOf(key);
    if (projectId) return projects.all.find((p) => p.id === projectId)?.categoryId;
    return practices.all.find((p) => p.id === practiceId)?.categoryId;
  };
  const offered = new Set(spheres.map((sphere) => sphere.id));
  return [
    ...spheres.flatMap((sphere) => [
      { key: `${CATEGORY}:${sphere.id}`, name: sphere.name, color: sphere.color, icon: sphere.icon },
      ...work.filter((item) => sphereOf(item.key) === sphere.id).map((item) => ({ ...item, indent: true })),
    ]),
    ...work.filter((item) => !offered.has(sphereOf(item.key) ?? "")),
  ];
}

/** A row of `filingItems`: the sphere it names, or the work it names. */
export function filingOf(key: string): { categoryId: string } | Purpose {
  const [kind, id] = key.split(":");
  return kind === CATEGORY ? { categoryId: id } : purposeOf(key);
}

/** The row a block is filed under: its project or practice when it has one, its sphere otherwise. */
export function filingKey(
  purpose: { projectId?: string | null; practiceId?: string | null },
  categoryId?: string | null,
) {
  return purposeKey(purpose) || (categoryId ? `${CATEGORY}:${categoryId}` : "");
}
