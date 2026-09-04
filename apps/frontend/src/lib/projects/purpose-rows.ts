import { restColor } from "$lib/colors";
import { categories, practices, projects } from "$lib/synced.svelte";

/** What an hour can be for: a live project or a practice, with its sphere's colour. */
export interface PurposeRow {
  readonly key: string;
  readonly name: string;
  readonly color: string;
  readonly practice: boolean;
  readonly purpose: { readonly projectId: string | null; readonly practiceId: string | null };
}

export function purposeRows(): PurposeRow[] {
  const colorOf = (categoryId: string) => categories.all.find((c) => c.id === categoryId)?.color ?? restColor;
  return [
    ...projects.all
      .filter((p) => p.status === "active" || p.status === "held")
      .map((p) => ({
        key: `project:${p.id}`,
        name: p.name || "Untitled project",
        color: colorOf(p.categoryId),
        practice: false,
        purpose: { projectId: p.id, practiceId: null },
      })),
    ...practices.all.map((p) => ({
      key: `practice:${p.id}`,
      name: p.name || "Unnamed practice",
      color: colorOf(p.categoryId),
      practice: true,
      purpose: { projectId: null, practiceId: p.id },
    })),
  ];
}

/** Rows whose name has a word starting with what was typed; all of them for nothing typed. */
export function matchPurposes(rows: readonly PurposeRow[], query: string): PurposeRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) =>
    r.name
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word.startsWith(q)),
  );
}
