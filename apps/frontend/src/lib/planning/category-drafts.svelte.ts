import type { RingSegment } from "$lib/components/ring/types";
import type { Category } from "$lib/core/records";
import { invalidate } from "$lib/core/store.svelte";
import { categories, synced, syncStatus } from "$lib/core/synced.svelte";
import { restColor, swatchPalette } from "$lib/ui/colors";
import { DEFAULT_ICON, randomIcon } from "$lib/ui/icons";

export const WEEK_HOURS = 168;

/** One slice of the ring, as the dial and its labels want it. */
export type Draft = {
  key: string;
  id: string;
  name: string;
  color: string;
  icon: string;
  hours: number;
  /** The sphere this one is a part of, or null for a slice of the ring. */
  parentId: string | null;
  /** The Keep page its work lives on, or null. */
  urn: string | null;
};

/**
 * How long after the last drag or keystroke an edit burst counts as finished.
 *
 * Dragging a seam writes on every frame; each of those is not something to undo separately. The
 * burst is closed when the hand stops, and one press of ⌘Z takes the whole movement back.
 */
const BURST_MS = 700;

function toDraft(category: Category): Draft {
  return {
    key: category.id,
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon || DEFAULT_ICON,
    hours: category.targetHoursPerWeek,
    parentId: category.parentId ?? null,
    urn: category.urn ?? null,
  };
}

function nextColor(used: string[]) {
  return swatchPalette.find((c) => !used.includes(c)) ?? swatchPalette[used.length % swatchPalette.length];
}

type PlanUnit = "h" | "%";

/** Hours are what's stored; a percentage is the same number read against the 168 in a week. */
export const toUnit = (hours: number, unit: PlanUnit) =>
  unit === "h" ? round(hours) : round((hours / WEEK_HOURS) * 100);

export const fromUnit = (value: number, unit: PlanUnit) =>
  unit === "h" ? round(value) : round((value / 100) * WEEK_HOURS);

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * The Week screen's category plan.
 *
 * There are no drafts here any more, and no save: a slice cut, renamed or dragged is written
 * straight to the synced collection, which is already what every screen draws from and already
 * holds the write until the server has taken it. What's left is the screen's own vocabulary —
 * slices, seams, the buffer's leftover hours — and the grouping of a drag into one undo step.
 */
class CategoryDrafts {
  #burst: ReturnType<typeof setTimeout> | null = null;
  #open = false;

  #live = $derived(categories.all.filter((category) => !category.isBuffer));
  /**
   * The slices of the ring: top-level spheres. A part is drawn inside its parent's section and its
   * hours are a share of the parent's, never more of the week — and a part whose parent is gone
   * stands on its own, as the server counts it.
   */
  drafts = $derived(
    this.#live
      .filter((category) => !category.parentId || !this.#live.some((parent) => parent.id === category.parentId))
      .map(toDraft),
  );
  /** Every sphere but the Buffer, parts included — what a parent is picked from. */
  all = $derived(categories.all.map((category) => ({ ...toDraft(category), isBuffer: category.isBuffer })));
  /** False until these records have been heard about at all — the screen shows its skeleton. */
  ready = $derived(categories.ready);
  loadError = $derived(synced.error);
  error = $derived(syncStatus.rejected);

  restHours = $derived(Math.max(0, WEEK_HOURS - this.drafts.reduce((sum, draft) => sum + draft.hours, 0)));

  segments = $derived<RingSegment[]>([
    ...this.drafts.map((draft) => ({
      id: draft.key,
      label: draft.name || "Untitled",
      color: draft.color,
      icon: draft.icon,
      value: draft.hours,
    })),
    { id: "__rest__", label: "Buffer", color: restColor, icon: "circle-dashed", value: this.restHours },
  ]);

  /** What the screen calls on mount. The rows are already on screen; this checks them. */
  enter = () => synced.ensure();

  load = () => synced.sync();

  /** The parts of one sphere, in the order they were made. */
  parts = (parentId: string) => this.#live.filter((category) => category.parentId === parentId).map(toDraft);

  update(id: string, patch: Partial<Draft>) {
    this.#grouped(() =>
      categories.update(id, {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.color === undefined ? {} : { color: patch.color }),
        ...(patch.icon === undefined ? {} : { icon: patch.icon }),
        ...(patch.hours === undefined ? {} : { targetHoursPerWeek: patch.hours }),
        ...(patch.parentId === undefined ? {} : { parentId: patch.parentId }),
        ...(patch.urn === undefined ? {} : { urn: patch.urn }),
      }),
    );
  }

  /** A seam dragged moves hours between neighbours: every slice at once, one step. */
  setAllHours = (values: number[]) => {
    this.#grouped(() => {
      this.drafts.forEach((draft, i) => {
        const hours = values[i];
        if (hours !== undefined && hours !== draft.hours) categories.update(draft.id, { targetHoursPerWeek: hours });
      });
    });
  };

  /** Cuts a slice in two. Past the last draft is the buffer: its half becomes a new category. */
  split = (index: number) => {
    this.#closeBurst();
    const used = this.drafts.map((draft) => draft.color);
    const worn = this.drafts.map((draft) => draft.icon);
    const target = this.drafts[index];
    const hours = target ? round(target.hours / 2) : round(this.restHours / 2);

    synced.transaction(() => {
      if (target) categories.update(target.id, { targetHoursPerWeek: round(target.hours - hours) });
      categories.create({
        name: "",
        color: nextColor(used),
        icon: randomIcon(worn),
        targetHoursPerWeek: target ? hours : round(this.restHours - hours),
        isBuffer: false,
        parentId: null,
        urn: null,
      });
    });
    invalidate.categories();
  };

  /**
   * A new part under a sphere, with no hours yet: a part's hours come out of its parent's, so it
   * starts by taking nothing from it, and the parent's colour, since it is a piece of that slice.
   */
  createPart = (parentId: string) => {
    this.#closeBurst();
    const parent = this.#live.find((category) => category.id === parentId);
    if (!parent) return;
    categories.create({
      name: "",
      color: parent.color,
      icon: parent.icon || DEFAULT_ICON,
      targetHoursPerWeek: 0,
      isBuffer: false,
      parentId,
      urn: null,
    });
    invalidate.categories();
  };

  remove = (draft: Draft) => {
    this.#closeBurst();
    categories.delete(draft.id);
    invalidate.categories();
  };

  /**
   * Runs a write as part of the burst that's in progress, starting one if there isn't. The burst
   * closes itself once the edits stop, so a caller never has to say when a gesture ended.
   */
  #grouped(write: () => void) {
    if (!this.#open) {
      this.#open = true;
      synced.beginStep();
    }
    write();
    invalidate.categories();
    if (this.#burst) clearTimeout(this.#burst);
    this.#burst = setTimeout(() => this.#closeBurst(), BURST_MS);
  }

  #closeBurst() {
    if (this.#burst) clearTimeout(this.#burst);
    this.#burst = null;
    if (!this.#open) return;
    this.#open = false;
    synced.commitStep();
  }
}

export const categoryDrafts = new CategoryDrafts();
