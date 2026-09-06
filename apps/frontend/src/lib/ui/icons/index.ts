import { Circle } from "lucide-svelte";
import { categoryIcons, type IconComponent, searchAliases } from "./catalog";

const iconNames = Object.keys(categoryIcons);

export const DEFAULT_ICON = "circle";

/** What a saved place wears in every list it appears in, until somebody picks it something else. */
export const PLACE_ICON = "map-pin";

/** An unknown name (an older client's icon, a hand-edited row) still draws as something. */
export const iconFor = (name: string | undefined): IconComponent => categoryIcons[name ?? ""] ?? Circle;

/** How an icon reads out loud, and what the search box matches against. */
export const iconLabel = (name: string) => name.replace(/-/g, " ");

/** Substring, not fuzzy: a two-letter query should still narrow rather than surprise. */
export function searchIcons(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return iconNames;
  return iconNames.filter(
    (name) => iconLabel(name).includes(q) || searchAliases[name]?.some((alias) => alias.includes(q)),
  );
}

/**
 * A new category starts with an icon it didn't have to be asked for. The two placeholder shapes
 * are skipped, and so is anything already on screen, so a fresh row looks distinct on arrival.
 */
export function randomIcon(taken: string[] = []): string {
  const pool = iconNames.filter((name) => name !== "circle" && name !== "circle-dashed" && !taken.includes(name));
  const from = pool.length > 0 ? pool : iconNames;
  return from[Math.floor(Math.random() * from.length)];
}
