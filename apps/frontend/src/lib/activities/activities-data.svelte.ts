import { archiveActivity, createActivity, updateActivity } from "$lib/queries";
import { invalidate, store } from "$lib/store.svelte";
import type { Activity } from "$lib/types";

export interface ActivityDraft {
  name: string;
  weights: { categoryId: string; weightPercent: number }[];
}

/** Owns the Activities screen's create/update/archive mutations over the shared store. */
class ActivitiesData {
  editing = $state<string | "new" | null>(null);
  actionError = $state<string | null>(null);

  activities = $derived(store.activities.hasValue ? (store.activities.value ?? []) : null);
  loadError = $derived(store.activities.error ?? store.categories.error);

  categoryById = $derived(new Map((store.categories.value ?? []).map((c) => [c.id, c])));
  planned = $derived((store.categories.value ?? []).filter((c) => !c.isBuffer));

  /** What the screen calls on mount: no request at all once the app already has these rows. */
  enter = () => {
    this.editing = null;
    this.actionError = null;
    return this.load();
  };

  load = () => Promise.all([store.activities.ensure(), store.categories.ensure()]);

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
      invalidate.activities();
      await store.activities.refresh();
    }, "Couldn't save that activity.");
  };

  archive = async (activity: Activity) => {
    const message = `Archive "${activity.name}"? It disappears from the list. Past entries stay.`;
    if (!confirm(message)) return;
    await this.#run(async () => {
      this.editing = null;
      await archiveActivity(activity.id);
      invalidate.activities();
      await store.activities.refresh();
    }, "Couldn't archive that activity.");
  };
}

export const activitiesData = new ActivitiesData();
