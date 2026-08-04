import type { activityCategoryWeights, categories } from "../db/schema";

/** Serializes a `categories` row into the shape the mobile app expects. */
export class CategoryDTO {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly targetHoursPerWeek: number;
  readonly isBuffer: boolean;
  readonly archived: boolean;

  constructor(c: typeof categories.$inferSelect) {
    this.id = c.id;
    this.name = c.name;
    this.color = c.color;
    this.targetHoursPerWeek = Number(c.targetHoursPerWeek);
    this.isBuffer = c.isBuffer;
    this.archived = c.archived;
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

/** Serializes an entry (with its activity's name) into the shape the mobile app expects. */
export class EntryDTO {
  readonly id: string;
  readonly activityId: string;
  readonly activityName: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly note: string | null;

  constructor(e: {
    id: string;
    activityId: string;
    startedAt: Date;
    endedAt: Date | null;
    note: string | null;
    activity: { name: string };
  }) {
    this.id = e.id;
    this.activityId = e.activityId;
    this.activityName = e.activity.name;
    this.startedAt = e.startedAt.toISOString();
    this.endedAt = e.endedAt ? e.endedAt.toISOString() : null;
    this.note = e.note;
  }
}
