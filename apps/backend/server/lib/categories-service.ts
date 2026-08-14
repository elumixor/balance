import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { activities, activityCategoryWeights, categories } from "../db/schema";
import { bufferCategoryService } from "./buffer-category";

export type CategoryInput = {
  name: string;
  color: string;
  icon?: string;
  targetHoursPerWeek: number;
};

export type ActivityWeightInput = {
  categoryId: string;
  weightPercent: number;
};

export type ActivityInput = {
  name: string;
  weights: ActivityWeightInput[];
};

/** CRUD for a single user's categories, keeping the system-managed buffer category in sync. */
export class CategoryService {
  constructor(private readonly userId: string) {}

  async create(input: CategoryInput) {
    const [created] = await db
      .insert(categories)
      .values({
        userId: this.userId,
        name: input.name,
        color: input.color,
        icon: input.icon ?? "circle",
        targetHoursPerWeek: input.targetHoursPerWeek.toString(),
      })
      .returning();
    await bufferCategoryService.sync(this.userId);
    return created;
  }

  async update(id: string, input: CategoryInput) {
    await this.assertNotBuffer(id);
    const [updated] = await db
      .update(categories)
      .set({
        name: input.name,
        color: input.color,
        ...(input.icon ? { icon: input.icon } : {}),
        targetHoursPerWeek: input.targetHoursPerWeek.toString(),
      })
      .where(and(eq(categories.id, id), eq(categories.userId, this.userId)))
      .returning();
    await bufferCategoryService.sync(this.userId);
    return updated;
  }

  async archive(id: string): Promise<void> {
    await this.assertNotBuffer(id);
    await db
      .update(categories)
      .set({ archived: true })
      .where(and(eq(categories.id, id), eq(categories.userId, this.userId)));
    await bufferCategoryService.sync(this.userId);
  }

  private async assertNotBuffer(id: string): Promise<void> {
    const existing = await db.query.categories.findFirst({
      where: and(eq(categories.id, id), eq(categories.userId, this.userId)),
    });
    if (!existing) throw new Error("Category not found");
    if (existing.isBuffer) throw new Error("The Buffer category is system-managed and can't be edited directly");
  }
}

/** CRUD for a single user's activities, including their weighted category distribution. */
export class ActivityService {
  constructor(private readonly userId: string) {}

  /**
   * Explicit weights may leave time unassigned — that remainder implicitly belongs to the
   * user's Buffer category, so an activity with no weights at all is 100% free time.
   * Returns the full weight list (explicit + implicit buffer remainder, if any) to persist.
   */
  async resolveWeightsWithBufferRemainder(weights: ActivityWeightInput[]): Promise<ActivityWeightInput[]> {
    const explicitTotal = weights.reduce((sum, w) => sum + w.weightPercent, 0);
    if (explicitTotal > 100) {
      throw new Error("Category weights can't add up to more than 100%");
    }

    const remainder = 100 - explicitTotal;
    if (remainder <= 0) return weights;

    const buffer = await bufferCategoryService.ensure(this.userId);
    return [...weights, { categoryId: buffer.id, weightPercent: remainder }];
  }

  async create(input: ActivityInput) {
    const weights = await this.resolveWeightsWithBufferRemainder(input.weights);

    const [activity] = await db.insert(activities).values({ userId: this.userId, name: input.name }).returning();

    await db.insert(activityCategoryWeights).values(
      weights.map((w) => ({
        activityId: activity.id,
        categoryId: w.categoryId,
        weightPercent: w.weightPercent,
      })),
    );

    return activity;
  }

  async update(id: string, input: ActivityInput) {
    const weights = await this.resolveWeightsWithBufferRemainder(input.weights);

    const existing = await db.query.activities.findFirst({
      where: and(eq(activities.id, id), eq(activities.userId, this.userId)),
    });
    if (!existing) throw new Error("Activity not found");

    await db.update(activities).set({ name: input.name }).where(eq(activities.id, id));
    await db.delete(activityCategoryWeights).where(eq(activityCategoryWeights.activityId, id));
    await db.insert(activityCategoryWeights).values(
      weights.map((w) => ({
        activityId: id,
        categoryId: w.categoryId,
        weightPercent: w.weightPercent,
      })),
    );

    return { ...existing, name: input.name };
  }

  async archive(id: string): Promise<void> {
    await db
      .update(activities)
      .set({ archived: true })
      .where(and(eq(activities.id, id), eq(activities.userId, this.userId)));
  }
}
