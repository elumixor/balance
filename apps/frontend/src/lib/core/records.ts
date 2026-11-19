/**
 * A category the user plans against. Archiving one is how it's deleted, and a deleted record
 * never reaches a screen — see `synced.svelte.ts` — so there is no `archived` to check here.
 */
export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  targetHoursPerWeek: number;
  /** The system-managed category absorbing whatever the week hasn't been planned into. */
  isBuffer: boolean;
  /** The sphere this one is a part of; spheres nest one level, so a parent never has one. */
  parentId: string | null;
  /** Where the work lives — a Keep page link — or null. */
  urn: string | null;
}

export interface ActivityWeight {
  categoryId: string;
  weightPercent: number;
}

export interface Activity {
  id: string;
  name: string;
  weights: ActivityWeight[];
}
