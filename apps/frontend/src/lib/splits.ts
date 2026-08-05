import { restColor } from "./colors";
import type { Activity, Category, Split } from "./types";

/**
 * An activity's category mix, with whatever it doesn't assign shown as free time.
 * Every place the app draws an activity uses this, so the colours always agree.
 */
export function activitySplits(activity: Activity, categories: Map<string, Category>): Split[] {
  const splits: Split[] = [];
  let assigned = 0;

  for (const weight of activity.weights) {
    const category = categories.get(weight.categoryId);
    if (!category || weight.weightPercent <= 0) continue;
    assigned += weight.weightPercent;
    splits.push({
      id: weight.categoryId,
      color: category.isBuffer ? restColor : category.color,
      value: weight.weightPercent,
    });
  }

  const free = Math.max(0, 100 - assigned);
  if (free > 0) splits.push({ id: "__free__", color: restColor, value: free });
  return splits;
}
