import { SvelteMap } from "svelte/reactivity";
import { invalidate } from "$lib/store.svelte";
import { activities, categories, synced, syncStatus } from "$lib/synced.svelte";
import type { Activity, ActivityWeight } from "$lib/types";

/**
 * One piece of an activity's split. Two pieces may share a category for as long as a split hasn't
 * been pointed at a different one yet — `weightsOf` is what merges them back down for the server.
 */
export interface Piece {
  key: string;
  categoryId: string;
  percent: number;
}

export interface ActivityDraft {
  key: string;
  id: string;
  name: string;
  pieces: Piece[];
}

export function weightsOf(pieces: readonly Piece[]): ActivityWeight[] {
  const byCategory = new Map<string, number>();
  for (const piece of pieces) {
    if (piece.percent <= 0) continue;
    byCategory.set(piece.categoryId, (byCategory.get(piece.categoryId) ?? 0) + piece.percent);
  }
  return [...byCategory.entries()].map(([categoryId, weightPercent]) => ({ categoryId, weightPercent }));
}

function piecesOf(weights: readonly ActivityWeight[]): Piece[] {
  // A piece is identified by its place in the split, not by its category: two of them may point
  // at the same one, and a key that couldn't tell those apart takes the whole screen down.
  return weights.map((weight, i) => ({
    key: `${weight.categoryId}#${i}`,
    categoryId: weight.categoryId,
    percent: weight.weightPercent,
  }));
}

/** How long after the last keystroke an edit burst counts as finished — one press of undo. */
const BURST_MS = 700;

/**
 * The Activities list.
 *
 * Every row is a synced record, so there is nothing to save: a name typed or a split reweighed is
 * written where the rest of the app already reads it, and held there until the server takes it.
 *
 * The one thing kept locally is how a split is currently cut up. Two pieces pointing at the same
 * category are one weight as far as the server is concerned, so a row rebuilt from what was sent
 * would merge them under the hand editing them — the pieces stay as the user left them until the
 * row is left alone.
 */
class ActivitiesData {
  readonly #pieces = new SvelteMap<string, Piece[]>();
  #burst: ReturnType<typeof setTimeout> | null = null;
  #open = false;

  /** The row that should grab the name field and select it — consumed once by that row. */
  focusKey = $state<string | null>(null);

  drafts = $derived(
    activities.all.map((activity) => ({
      key: activity.id,
      id: activity.id,
      name: activity.name,
      pieces: this.#pieces.get(activity.id) ?? piecesOf(activity.weights),
    })),
  );

  ready = $derived(activities.ready && categories.ready);
  loadError = $derived(synced.error);
  error = $derived(syncStatus.rejected);
  categoryById = $derived(new Map(categories.all.map((category) => [category.id, category])));
  planned = $derived(categories.all.filter((category) => !category.isBuffer));

  /**
   * What the screen calls on mount — the rows are already here; this checks them. Also where the
   * locally-cut splits are dropped: a row nobody is editing should read as the server has it.
   */
  enter = () => {
    this.#pieces.clear();
    return synced.ensure();
  };

  load = () => {
    this.#pieces.clear();
    return synced.sync();
  };

  /** A blank row, on screen and in edit mode before the server has heard of it. */
  add() {
    this.#closeBurst();
    const created = activities.create({ name: "", weights: [] });
    this.focusKey = created.id;
    invalidate.activities();
  }

  update(id: string, patch: Partial<Pick<ActivityDraft, "name" | "pieces">>) {
    if (patch.pieces) this.#pieces.set(id, patch.pieces);
    this.#grouped(() => {
      activities.update(id, {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.pieces === undefined ? {} : { weights: weightsOf(patch.pieces) }),
      } satisfies Partial<Activity>);
    });
  }

  archive = (draft: ActivityDraft) => {
    const message = `Archive "${draft.name || "this activity"}"? It disappears from the list. Past entries stay.`;
    if (!confirm(message)) return;
    this.#closeBurst();
    this.#pieces.delete(draft.id);
    activities.delete(draft.id);
    invalidate.activities();
  };

  #grouped(write: () => void) {
    if (!this.#open) {
      this.#open = true;
      synced.beginStep();
    }
    write();
    invalidate.activities();
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

export const activitiesData = new ActivitiesData();
