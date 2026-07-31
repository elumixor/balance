import type { activities, activityCategoryWeights, categories } from "@/db/schema";

export type CategoryRow = typeof categories.$inferSelect;
export type ActivityWeightRow = typeof activityCategoryWeights.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect & {
  weights: ActivityWeightRow[];
};

export type { ActivityInput, ActivityWeightInput, CategoryInput } from "@/lib/categories-service";
