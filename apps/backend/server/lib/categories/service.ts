import { and, asc, eq } from "drizzle-orm";
import { db } from "~/db";
import { activities, activityCategoryWeights, categories } from "~/db/schema";
import { ApiError, NotFoundError } from "~/lib/http/api-error";
import { bufferCategoryService } from "./buffer";

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

type CategoryRow = typeof categories.$inferSelect;
type ActivityRow = typeof activities.$inferSelect;
export type ActivityWithWeights = ActivityRow & { weights: (typeof activityCategoryWeights.$inferSelect)[] };

/** Nobody edits the buffer by hand: it is the remainder of the ring, kept right by `sync`. */
const BUFFER_IS_MANAGED = "The Buffer category is system-managed and can't be edited directly";
const BUFFER_IS_MANAGED_STATUS = 403;

/** CRUD for a single user's categories, keeping the system-managed buffer category in sync. */
export class CategoryService {
  constructor(private readonly userId: string) {}

  /**
   * The buffer's target is derived from every other category's, so it has to be right before
   * anyone reads it — and a first read is the only chance to make one for a new account. So a
   * read syncs, which is a write; it changes nothing when nothing has moved.
   */
  async list(): Promise<CategoryRow[]> {
    await bufferCategoryService.sync(this.userId);
    return db.query.categories.findMany({
      where: and(eq(categories.userId, this.userId), eq(categories.archived, false)),
      orderBy: asc(categories.createdAt),
    });
  }

  async create(input: CategoryInput): Promise<CategoryRow> {
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

  async update(id: string, input: CategoryInput): Promise<CategoryRow> {
    await this.#assertEditable(id);
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
    await this.#setArchived(id, true);
  }

  async restore(id: string): Promise<void> {
    await this.#setArchived(id, false);
  }

  async #setArchived(id: string, archived: boolean): Promise<void> {
    await this.#assertEditable(id);
    await db
      .update(categories)
      .set({ archived })
      .where(and(eq(categories.id, id), eq(categories.userId, this.userId)));
    await bufferCategoryService.sync(this.userId);
  }

  async #assertEditable(id: string): Promise<void> {
    const existing = await db.query.categories.findFirst({
      where: and(eq(categories.id, id), eq(categories.userId, this.userId)),
    });
    if (!existing) throw new NotFoundError("Category not found");
    if (existing.isBuffer) throw new ApiError(BUFFER_IS_MANAGED, BUFFER_IS_MANAGED_STATUS);
  }
}

/** CRUD for a single user's activities, including their weighted category distribution. */
export class ActivityService {
  constructor(private readonly userId: string) {}

  async list(): Promise<ActivityWithWeights[]> {
    return db.query.activities.findMany({
      where: and(eq(activities.userId, this.userId), eq(activities.archived, false)),
      orderBy: asc(activities.createdAt),
      with: { weights: true },
    });
  }

  /**
   * Explicit weights may leave time unassigned — that remainder implicitly belongs to the
   * user's Buffer category, so an activity with no weights at all is 100% free time.
   * Returns the full weight list (explicit + implicit buffer remainder, if any) to persist.
   */
  async resolveWeightsWithBufferRemainder(weights: ActivityWeightInput[]): Promise<ActivityWeightInput[]> {
    const explicitTotal = weights.reduce((sum, w) => sum + w.weightPercent, 0);
    if (explicitTotal > 100) throw new ApiError("Category weights can't add up to more than 100%");

    const remainder = 100 - explicitTotal;
    if (remainder <= 0) return weights;

    const buffer = await bufferCategoryService.ensure(this.userId);

    // A split can name the Buffer itself and still leave something over. The two are the same
    // hours, so they're one row: appending a second one would give the activity that category
    // twice, which every reader of the list then has to guess how to add up.
    const explicitBuffer = weights.find((w) => w.categoryId === buffer.id);
    if (explicitBuffer) {
      return weights.map((w) => (w === explicitBuffer ? { ...w, weightPercent: w.weightPercent + remainder } : w));
    }

    return [...weights, { categoryId: buffer.id, weightPercent: remainder }];
  }

  async create(input: ActivityInput): Promise<ActivityWithWeights> {
    const weights = await this.resolveWeightsWithBufferRemainder(input.weights);
    const [activity] = await db.insert(activities).values({ userId: this.userId, name: input.name }).returning();
    const written = await db
      .insert(activityCategoryWeights)
      .values(
        weights.map((w) => ({ activityId: activity.id, categoryId: w.categoryId, weightPercent: w.weightPercent })),
      )
      .returning();
    return { ...activity, weights: written };
  }

  async update(id: string, input: ActivityInput): Promise<ActivityWithWeights> {
    const weights = await this.resolveWeightsWithBufferRemainder(input.weights);

    const [updated] = await db
      .update(activities)
      .set({ name: input.name })
      .where(and(eq(activities.id, id), eq(activities.userId, this.userId)))
      .returning();
    if (!updated) throw new NotFoundError("Activity not found");

    await db.delete(activityCategoryWeights).where(eq(activityCategoryWeights.activityId, id));
    const written = await db
      .insert(activityCategoryWeights)
      .values(weights.map((w) => ({ activityId: id, categoryId: w.categoryId, weightPercent: w.weightPercent })))
      .returning();
    return { ...updated, weights: written };
  }

  async archive(id: string): Promise<void> {
    await this.#setArchived(id, true);
  }

  async restore(id: string): Promise<void> {
    await this.#setArchived(id, false);
  }

  async #setArchived(id: string, archived: boolean): Promise<void> {
    await db
      .update(activities)
      .set({ archived })
      .where(and(eq(activities.id, id), eq(activities.userId, this.userId)));
  }
}
