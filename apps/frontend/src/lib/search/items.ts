/**
 * What the palette can find, and how the rows are ordered for what was typed.
 *
 * Every source — the screens, the settings sections, the projects and their tasks, the people,
 * the calendar's hits — hands over rows of the same shape, and this puts them in one order: the
 * start of a word of the label first, then anywhere in the label, then a keyword nobody sees.
 * Within a rank the sources keep their own order, so a project stays above its tasks.
 */

export type SearchKind = "screen" | "setting" | "project" | "task" | "person" | "event";

export interface SearchItem {
  readonly id: string;
  readonly kind: SearchKind;
  readonly label: string;
  /** A second line: the sphere a project is under, the date an event is on, an address. */
  readonly hint?: string;
  /** Words to match that aren't shown — what a settings section is about. */
  readonly keywords?: string;
  readonly run: () => void;
}

/** Past this, a palette is a list to read, and reading a list is slower than typing one more letter. */
export const SHOWN = 14;

const WORD_START = 3;
const IN_LABEL = 2;
const IN_KEYWORDS = 1;

export function rankItems(items: readonly SearchItem[], query: string, limit = SHOWN): SearchItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items.slice(0, limit);

  const scored: { item: SearchItem; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const score = scoreOf(item, needle);
    if (score > 0) scored.push({ item, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((entry) => entry.item);
}

function scoreOf(item: SearchItem, needle: string): number {
  const label = item.label.toLowerCase();
  const hint = (item.hint ?? "").toLowerCase();
  if (label.split(/[\s.,_/-]+/).some((word) => word.startsWith(needle))) return WORD_START;
  if (label.includes(needle) || hint.includes(needle)) return IN_LABEL;
  if ((item.keywords ?? "").toLowerCase().includes(needle)) return IN_KEYWORDS;
  return 0;
}

/** The sections of the list, in the order they are drawn, with the word each one is headed by. */
export const KIND_LABELS: Record<SearchKind, string> = {
  screen: "Go to",
  setting: "Settings",
  project: "Projects",
  task: "Tasks",
  person: "People",
  event: "Events",
};

/** The rows grouped under their heading, in kind order, keeping each kind's own ranking. */
export function groupItems(items: readonly SearchItem[]): { kind: SearchKind; items: SearchItem[] }[] {
  const kinds = Object.keys(KIND_LABELS) as SearchKind[];
  return kinds
    .map((kind) => ({ kind, items: items.filter((item) => item.kind === kind) }))
    .filter((group) => group.items.length > 0);
}
