import { restColor, swatchPalette } from "$lib/colors";
import { archiveCategory, createCategory, updateCategory } from "$lib/queries";
import { invalidate, store } from "$lib/store.svelte";
import type { Category, RingSegment } from "$lib/types";

export const WEEK_HOURS = 168;
export const AUTOSAVE_DELAY_MS = 700;

export type Draft = {
  key: string;
  id: string | null;
  name: string;
  color: string;
  hours: number;
  saved?: { name: string; color: string; hours: number };
};

function nextColor(used: string[]) {
  return swatchPalette.find((c) => !used.includes(c)) ?? swatchPalette[used.length % swatchPalette.length];
}

function isDirty(draft: Draft) {
  return (
    !draft.saved ||
    draft.saved.name !== draft.name ||
    draft.saved.color !== draft.color ||
    draft.saved.hours !== draft.hours
  );
}

function toDraft(category: Category): Draft {
  return {
    key: category.id,
    id: category.id,
    name: category.name,
    color: category.color,
    hours: category.targetHoursPerWeek,
    saved: { name: category.name, color: category.color, hours: category.targetHoursPerWeek },
  };
}

/**
 * Owns the Week screen's editable category plan: per-row drafts over the shared store, the
 * save the page debounces, and the split/remove mutations the ring and row list drive.
 */
class CategoryDrafts {
  drafts = $state<Draft[]>([]);
  saving = $state(false);
  error = $state<string | null>(null);

  categories = $derived(store.categories.hasValue ? (store.categories.value ?? []) : null);
  loadError = $derived(store.categories.error);

  restHours = $derived(Math.max(0, WEEK_HOURS - this.drafts.reduce((sum, d) => sum + d.hours, 0)));
  dirty = $derived(this.drafts.some(isDirty));

  segments = $derived<RingSegment[]>([
    ...this.drafts.map((d) => ({ id: d.key, label: d.name || "Untitled", color: d.color, value: d.hours })),
    { id: "__rest__", label: "Rest + Buffer", color: restColor, value: this.restHours },
  ]);

  /**
   * What the screen calls on mount. Edits typed before navigating away outlive the screen now,
   * so they win over the cached rows — rebuilding from cache would silently undo them.
   */
  enter = async () => {
    const dirty = this.dirty;
    await store.categories.ensure();
    if (!dirty) this.#syncDrafts();
  };

  load = async () => {
    await store.categories.refresh();
    this.#syncDrafts();
  };

  #syncDrafts() {
    this.drafts = (store.categories.value ?? []).filter((c) => !c.isBuffer).map(toDraft);
  }

  /** True while there is something worth writing — an unnamed row is still being typed. */
  get savable() {
    return !this.saving && this.dirty && this.drafts.every((d) => d.name.trim());
  }

  /** Writes every changed row. The page calls this a moment after the last edit. */
  flush = async () => {
    const changed = this.drafts.filter(isDirty);
    if (changed.length === 0) return;
    this.saving = true;
    this.error = null;
    try {
      for (const draft of changed) {
        const payload = { name: draft.name, color: draft.color, targetHoursPerWeek: draft.hours };
        if (draft.id) await updateCategory(draft.id, payload);
        else await createCategory(payload);
      }
      invalidate.categories();
      await this.load();
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Couldn't save your plan";
    } finally {
      this.saving = false;
    }
  };

  update(key: string, patch: Partial<Draft>) {
    this.drafts = this.drafts.map((d) => (d.key === key ? { ...d, ...patch } : d));
  }

  setAllHours = (values: number[]) => {
    this.drafts = this.drafts.map((d, i) => ({ ...d, hours: values[i] ?? d.hours }));
  };

  split = (index: number) => {
    const used = this.drafts.map((d) => d.color);
    if (index >= this.drafts.length) {
      this.drafts = [
        {
          key: `new-${this.drafts.length}-${this.restHours}`,
          id: null,
          name: "",
          color: nextColor(used),
          hours: this.restHours / 2,
        },
      ];
      return;
    }
    const target = this.drafts[index];
    const half = Math.round((target.hours / 2) * 10) / 10;
    this.drafts = [
      ...this.drafts.slice(0, index),
      { ...target, hours: half },
      {
        key: `new-${index}-${this.drafts.length}`,
        id: null,
        name: "",
        color: nextColor([...used, target.color]),
        hours: Math.round((target.hours - half) * 10) / 10,
      },
      ...this.drafts.slice(index + 1),
    ];
  };

  remove = async (draft: Draft) => {
    this.drafts = this.drafts.filter((d) => d.key !== draft.key);
    if (!draft.id) return;
    await archiveCategory(draft.id);
    invalidate.categories();
    await this.load();
  };
}

export const categoryDrafts = new CategoryDrafts();
