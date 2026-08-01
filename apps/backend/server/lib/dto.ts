import type { activityCategoryWeights, categories } from "../db/schema";

export type CategoryDTO = {
  id: string;
  name: string;
  color: string;
  targetHoursPerWeek: number;
  isBuffer: boolean;
  archived: boolean;
};

export function serializeCategory(c: typeof categories.$inferSelect): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    color: c.color,
    targetHoursPerWeek: Number(c.targetHoursPerWeek),
    isBuffer: c.isBuffer,
    archived: c.archived,
  };
}

export type ActivityWeightDTO = { categoryId: string; weightPercent: number };
export type ActivityDTO = {
  id: string;
  name: string;
  archived: boolean;
  weights: ActivityWeightDTO[];
};

export function serializeActivity(a: {
  id: string;
  name: string;
  archived: boolean;
  weights: (typeof activityCategoryWeights.$inferSelect)[];
}): ActivityDTO {
  return {
    id: a.id,
    name: a.name,
    archived: a.archived,
    weights: a.weights.map((w) => ({ categoryId: w.categoryId, weightPercent: w.weightPercent })),
  };
}

export type EntryDTO = {
  id: string;
  activityId: string;
  activityName: string;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
};

export function serializeEntry(e: {
  id: string;
  activityId: string;
  startedAt: Date;
  endedAt: Date | null;
  note: string | null;
  activity: { name: string };
}): EntryDTO {
  return {
    id: e.id,
    activityId: e.activityId,
    activityName: e.activity.name,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt ? e.endedAt.toISOString() : null,
    note: e.note,
  };
}
