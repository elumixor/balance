import { restColor, swatchPalette } from "$lib/colors";
import { DEFAULT_ICON, randomIcon } from "$lib/icons";
import { archiveCategory, createCategory, updateCategory } from "$lib/queries";
import { invalidate, store } from "$lib/store.svelte";
import type { Category, RingSegment } from "$lib/types";

/**
 * The rows the shared cache should hold, given what the drafts currently say. A row the server
 * hasn't seen yet stands in under its draft key — an id nothing can be written back to, which is
 * the right shape for something that doesn't exist anywhere else yet.
 */
function toCategory(draft: Draft): Category {
  return {
    id: draft.id ?? draft.key,
    name: draft.name,
    color: draft.color,
    icon: draft.icon,
    targetHoursPerWeek: draft.hours,
    isBuffer: false,
    archived: false,
  };
}

export const WEEK_HOURS = 168;
export const AUTOSAVE_DELAY_MS = 700;

export type Draft = {
  key: string;
  id: string | null;
  name: string;
  color: string;
  icon: string;
  hours: number;
  saved?: { name: string; color: string; icon: string; hours: number };
};

/** Counts the cuts made this session, so a row the server has never seen still has its own key. */
let cut = 0;

function nextColor(used: string[]) {
  return swatchPalette.find((c) => !used.includes(c)) ?? swatchPalette[used.length % swatchPalette.length];
}

function isDirty(draft: Draft) {
  return (
    !draft.saved ||
    draft.saved.name !== draft.name ||
    draft.saved.color !== draft.color ||
    draft.saved.icon !== draft.icon ||
    draft.saved.hours !== draft.hours
  );
}

function toDraft(category: Category): Draft {
  return {
    key: category.id,
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon || DEFAULT_ICON,
    hours: category.targetHoursPerWeek,
    saved: {
      name: category.name,
      color: category.color,
      icon: category.icon || DEFAULT_ICON,
      hours: category.targetHoursPerWeek,
    },
  };
}

export type PlanUnit = "h" | "%";

/** Hours are what's stored; a percentage is the same number read against the 168 in a week. */
export const toUnit = (hours: number, unit: PlanUnit) =>
  unit === "h" ? round(hours) : round((hours / WEEK_HOURS) * 100);

export const fromUnit = (value: number, unit: PlanUnit) =>
  unit === "h" ? round(value) : round((value / 100) * WEEK_HOURS);

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Owns the Week screen's editable category plan: per-row drafts over the shared store, the
 * save the page debounces, and the split/remove mutations the ring's labels drive.
 *
 * Every edit lands in the shared cache the moment it's made, so the colours and names the rest
 * of the app draws with are never a request behind what's on screen — and a cold start opens on
 * them, because the cache writes itself to the device. The server is asked afterwards, and its
 * answer is what the next load reads.
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
    ...this.drafts.map((d) => ({
      id: d.key,
      label: d.name || "Untitled",
      color: d.color,
      icon: d.icon,
      value: d.hours,
    })),
    { id: "__rest__", label: "Buffer", color: restColor, icon: "circle-dashed", value: this.restHours },
  ]);

  /**
   * What the screen calls on mount. Edits typed before navigating away outlive the screen now,
   * so they win over the cached rows — rebuilding from cache would silently undo them.
   */
  enter = async () => {
    const dirty = this.dirty;
    if (!dirty) this.#syncDrafts();
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

  /**
   * Puts what the drafts say into the shared cache, and marks it worth checking. The buffer rows
   * are the server's own and pass through untouched — nothing on this screen edits them.
   */
  #publish() {
    const buffers = (store.categories.value ?? []).filter((c) => c.isBuffer);
    store.categories.set([...this.drafts.map(toCategory), ...buffers]);
    invalidate.categories();
  }

  /** True while there is something worth writing — an unnamed row is still being typed. */
  get savable() {
    return !this.saving && this.dirty && this.drafts.every((d) => d.name.trim());
  }

  /**
   * Writes every changed row. The page calls this a moment after the last edit, and the screen
   * is already showing the answer — what this adds is the id a new row was given, and the check
   * behind it. A row edited again while its own write was out stays dirty, and goes again.
   */
  flush = async () => {
    const changed = this.drafts.filter(isDirty);
    if (changed.length === 0) return;
    this.saving = true;
    this.error = null;
    try {
      for (const draft of changed) {
        const payload = { name: draft.name, color: draft.color, icon: draft.icon, targetHoursPerWeek: draft.hours };
        const written = draft.id ? await updateCategory(draft.id, payload) : await createCategory(payload);
        const saved = { name: payload.name, color: payload.color, icon: payload.icon, hours: payload.targetHoursPerWeek };
        this.drafts = this.drafts.map((d) => (d.key === draft.key ? { ...d, id: written.id, saved } : d));
      }
      this.#publish();
      // Not awaited: the rows on screen are already the ones just written, and a screen that
      // waits on the server has nothing to show for the wait.
      void store.categories.refresh();
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Couldn't save your plan";
      await this.load();
    } finally {
      this.saving = false;
    }
  };

  update(key: string, patch: Partial<Draft>) {
    this.drafts = this.drafts.map((d) => (d.key === key ? { ...d, ...patch } : d));
    this.#publish();
  }

  setAllHours = (values: number[]) => {
    this.drafts = this.drafts.map((d, i) => ({ ...d, hours: values[i] ?? d.hours }));
    this.#publish();
  };

  /** Cuts a slice in two. Past the last draft is the buffer: its half becomes a new category. */
  split = (index: number) => {
    const used = this.drafts.map((d) => d.color);
    const wearing = this.drafts.map((d) => d.icon);
    const fresh = (hours: number, taken: string[], worn: string[]): Draft => ({
      key: `new-${++cut}`,
      id: null,
      name: "",
      color: nextColor(taken),
      icon: randomIcon(worn),
      hours,
    });

    if (index >= this.drafts.length) {
      this.drafts = [...this.drafts, fresh(Math.round((this.restHours / 2) * 10) / 10, used, wearing)];
    } else {
      const target = this.drafts[index];
      const half = Math.round((target.hours / 2) * 10) / 10;
      this.drafts = [
        ...this.drafts.slice(0, index),
        { ...target, hours: half },
        fresh(Math.round((target.hours - half) * 10) / 10, [...used, target.color], [...wearing, target.icon]),
        ...this.drafts.slice(index + 1),
      ];
    }
    this.#publish();
  };

  remove = async (draft: Draft) => {
    const previous = this.drafts;
    this.drafts = this.drafts.filter((d) => d.key !== draft.key);
    this.#publish();
    if (!draft.id) return;
    try {
      await archiveCategory(draft.id);
      void store.categories.refresh();
    } catch (e) {
      // The row goes back where it was: it still exists, whatever the screen said for a moment.
      this.drafts = previous;
      this.#publish();
      this.error = e instanceof Error ? e.message : "Couldn't remove that category";
    }
  };
}

export const categoryDrafts = new CategoryDrafts();
