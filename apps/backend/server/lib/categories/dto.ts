import type { activityCategoryWeights, categories } from "~/db/schema";

/** Serializes a `categories` row into the shape the mobile app expects. */
export class CategoryDTO {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly targetHoursPerWeek: number;
  readonly isBuffer: boolean;
  readonly archived: boolean;
  /** The sphere this one is a part of, or null for a slice of the ring. */
  readonly parentId: string | null;
  /** The Keep page this sphere is the hours of, as its link. */
  readonly urn: string | null;

  constructor(c: typeof categories.$inferSelect) {
    this.id = c.id;
    this.name = c.name;
    this.color = c.color;
    this.icon = c.icon;
    this.targetHoursPerWeek = Number(c.targetHoursPerWeek);
    this.isBuffer = c.isBuffer;
    this.archived = c.archived;
    this.parentId = c.parentId;
    this.urn = c.urn;
  }
}

export type ActivityWeightDTO = { categoryId: string; weightPercent: number };

/** Serializes an activity (with its category weights) into the shape the mobile app expects. */
export class ActivityDTO {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  readonly weights: ActivityWeightDTO[];

  constructor(a: {
    id: string;
    name: string;
    archived: boolean;
    weights: (typeof activityCategoryWeights.$inferSelect)[];
  }) {
    this.id = a.id;
    this.name = a.name;
    this.archived = a.archived;
    this.weights = a.weights.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent }));
  }
}
