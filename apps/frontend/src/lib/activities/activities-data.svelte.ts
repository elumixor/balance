import { archiveActivity, createActivity, getActivities, getCategories, updateActivity } from "$lib/queries";
import type { Activity, Category } from "$lib/types";

export interface ActivityDraft {
  name: string;
  weights: { categoryId: string; weightPercent: number }[];
}

/** Owns the Activities screen's data loading and create/update/archive mutations. */
export class ActivitiesData {
  activities = $state<Activity[] | null>(null);
  editing = $state<string | "new" | null>(null);
  loadError = $state<string | null>(null);
  actionError = $state<string | null>(null);

  #categories = $state<Category[]>([]);

  categoryById = $derived(new Map(this.#categories.map((c) => [c.id, c])));
  planned = $derived(this.#categories.filter((c) => !c.isBuffer));

  load = async () => {
    try {
      const [activities, categories] = await Promise.all([getActivities(), getCategories()]);
      this.activities = activities;
      this.#categories = categories;
      this.loadError = null;
    } catch (e) {
      this.loadError = e instanceof Error ? e.message : "Couldn't load your activities.";
    }
  };

  /** Keeps a failed write from disappearing into an unhandled rejection with nothing on screen. */
  async #run(action: () => Promise<unknown>, fallback: string) {
    try {
      this.actionError = null;
      await action();
    } catch (e) {
      this.actionError = e instanceof Error ? e.message : fallback;
    }
  }

  save = async (id: string | "new", draft: ActivityDraft) => {
    await this.#run(async () => {
      if (id === "new") await createActivity(draft);
      else await updateActivity(id, draft);
      this.editing = null;
      await this.load();
    }, "Couldn't save that activity.");
  };

  archive = async (activity: Activity) => {
    const message = `Archive "${activity.name}"? It disappears from the list. Past entries stay.`;
    if (!confirm(message)) return;
    await this.#run(async () => {
      this.editing = null;
      await archiveActivity(activity.id);
      await this.load();
    }, "Couldn't archive that activity.");
  };
}
