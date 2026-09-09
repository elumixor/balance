import type { PickerItem } from "$lib/components/Picker.svelte";
import type { Category } from "$lib/core/records";

/** Spheres as picker rows — the same badge they wear everywhere else. */
export function categoryItems(categories: readonly Category[]): PickerItem[] {
  return categories.map((c) => ({ key: c.id, name: c.name, color: c.color, icon: c.icon }));
}
