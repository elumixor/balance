import type { PickerItem } from "$lib/components/Picker.svelte";
import type { Category } from "$lib/core/records";
import { categories, practices } from "$lib/core/synced.svelte";
import { restColor } from "$lib/ui/colors";

const PRACTICE = "practice";
const CATEGORY = "category";

/** A practice as one string, so a picker can name it the way it names anything else. */
export function practiceKey(practiceId: string | null | undefined) {
  return practiceId ? `${PRACTICE}:${practiceId}` : "";
}

/** The practice a picker row names, or null for a row that names none. */
export function practiceOf(key: string): string | null {
  const [kind, id] = key.split(":");
  return kind === PRACTICE ? id : null;
}

const colorOf = (categoryId: string) => categories.all.find((c) => c.id === categoryId)?.color ?? restColor;

/** Every practice as picker rows, each in its sphere's colour. */
export function practiceItems(): PickerItem[] {
  return practices.all.map((p) => ({
    key: practiceKey(p.id),
    name: p.name || "Unnamed practice",
    color: colorOf(p.categoryId),
    practice: true,
  }));
}

/**
 * What an hour counts as and what it was for, as one list: each sphere, with its practices under
 * it, so the card asks one question rather than two. A practice whose sphere isn't on offer still
 * comes last, unindented, rather than vanishing.
 */
export function filingItems(spheres: readonly Category[]): PickerItem[] {
  const work = practiceItems();
  const sphereOf = (key: string) => practices.all.find((p) => p.id === practiceOf(key))?.categoryId;
  const offered = new Set(spheres.map((sphere) => sphere.id));
  return [
    ...spheres.flatMap((sphere) => [
      { key: `${CATEGORY}:${sphere.id}`, name: sphere.name, color: sphere.color, icon: sphere.icon },
      ...work.filter((item) => sphereOf(item.key) === sphere.id).map((item) => ({ ...item, indent: true })),
    ]),
    ...work.filter((item) => !offered.has(sphereOf(item.key) ?? "")),
  ];
}

/** A row of `filingItems`: the sphere it names, or the practice it names. */
export function filingOf(key: string): { categoryId: string } | { practiceId: string | null } {
  const [kind, id] = key.split(":");
  return kind === CATEGORY ? { categoryId: id } : { practiceId: practiceOf(key) };
}

/** The row a block is filed under: its practice when it has one, its sphere otherwise. */
export function filingKey(practiceId: string | null | undefined, categoryId?: string | null) {
  return practiceKey(practiceId) || (categoryId ? `${CATEGORY}:${categoryId}` : "");
}
