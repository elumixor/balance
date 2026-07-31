import type { activities, activityCategoryWeights, categories } from "@/db/schema";

export type CategoryRow = typeof categories.$inferSelect;
export type ActivityWeightRow = typeof activityCategoryWeights.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect & {
  weights: ActivityWeightRow[];
};

export type CategoryInput = {
  name: string;
  color: string;
  targetHoursPerWeek: number;
  trackingMode: "consistency" | "average";
  isProductiveLoad: boolean;
};

export type ActivityWeightInput = {
  categoryId: string;
  weightPercent: number;
};

export type ActivityInput = {
  name: string;
  weights: ActivityWeightInput[];
};
