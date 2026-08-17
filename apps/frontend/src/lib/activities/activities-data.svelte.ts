import { archiveActivity, createActivity, restoreActivity, updateActivity } from "$lib/queries";
import { invalidate, store } from "$lib/store.svelte";
import type { Activity, ActivityWeight } from "$lib/types";
import { planHistory } from "$lib/week/plan-history.svelte";

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
  id: string | null;
  name: string;
  pieces: Piece[];
  saved?: { name: string; weights: ActivityWeight[] };
}

let cut = 0;

export function weightsOf(pieces: readonly Piece[]): ActivityWeight[] {
  const byCategory = new Map<string, number>();
  for (const piece of pieces) {
    if (piece.percent <= 0) continue;
    byCategory.set(piece.categoryId, (byCategory.get(piece.categoryId) ?? 0) + piece.percent);
  }
  return [...byCategory.entries()].map(([categoryId, weightPercent]) => ({ categoryId, weightPercent }));
}

function toDraft(activity: Activity): ActivityDraft {
  return {
    key: activity.id,
    id: activity.id,
    name: activity.name,
    // A piece is identified by its place in the split, not by its category: two of them may point
    // at the same one, and a key that couldn't tell those apart takes the whole screen down.
    pieces: activity.weights.map((w, i) => ({
      key: `${w.categoryId}#${i}`,
      categoryId: w.categoryId,
      percent: w.weightPercent,
    })),
    saved: { name: activity.name, weights: activity.weights },
  };
}

function toActivity(draft: ActivityDraft): Activity {
  return { id: draft.id ?? draft.key, name: draft.name, archived: false, weights: weightsOf(draft.pieces) };
}

function sameWeights(a: readonly ActivityWeight[], b: readonly ActivityWeight[]) {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((w) => [w.categoryId, w.weightPercent]));
  return b.every((w) => byId.get(w.categoryId) === w.weightPercent);
}

function isDirty(draft: ActivityDraft) {
  return !draft.saved || draft.saved.name !== draft.name || !sameWeights(draft.saved.weights, weightsOf(draft.pieces));
}

/**
 * Owns the Activities list: per-row drafts over the shared store, autosaved the moment a name is
 * typed or a split changed. Adding one is purely local — it's on screen and in edit mode before
 * anything is asked of the server, the way every other write in this app draws ahead of its own
 * network round trip.
 */
class ActivitiesData {
  drafts = $state<ActivityDraft[]>([]);
  saving = $state(false);
  error = $state<string | null>(null);
  /** The row that should grab the name field and select it — consumed once by that row. */
  focusKey = $state<string | null>(null);

  /** What the drafts looked like before the edit burst that's still running. */
  #historyBefore: ActivityDraft[] | null = null;

  loadError = $derived(store.activities.error ?? store.categories.error);
  categoryById = $derived(new Map((store.categories.value ?? []).map((c) => [c.id, c])));
  planned = $derived((store.categories.value ?? []).filter((c) => !c.isBuffer));
  dirty = $derived(this.drafts.some(isDirty));

  /** What the screen calls on mount — edits typed before navigating away outlive the screen. */
  enter = async () => {
    if (!this.dirty) this.#syncDrafts();
    await Promise.all([store.activities.ensure(), store.categories.ensure()]);
    // Asked again rather than remembered from before the request: an edit typed while it was out
    // is exactly what this must not overwrite, and it wasn't there to see when the screen opened.
    if (!this.dirty) this.#syncDrafts();
  };

  load = async () => {
    await Promise.all([store.activities.refresh(), store.categories.refresh()]);
    this.#syncDrafts();
    planHistory.clear();
  };

  #syncDrafts() {
    this.drafts = (store.activities.value ?? []).filter((a) => !a.archived).map(toDraft);
  }

  /** Puts what the drafts say into the shared cache, so the rest of the app never lags a keystroke. */
  #publish() {
    store.activities.set(this.drafts.map(toActivity));
    invalidate.activities();
  }

  get savable() {
    return !this.saving && this.dirty && this.drafts.every((d) => d.name.trim());
  }

  /** Marks an edit burst as started, if one isn't already running — one undo step per burst. */
  #beginEdit() {
    if (this.#historyBefore === null) this.#historyBefore = this.drafts;
  }

  /** Closes the running burst, if any, as one undo step — a rename or a split reweighed. */
  #commitEdit() {
    const before = this.#historyBefore;
    this.#historyBefore = null;
    if (!before || before === this.drafts) return;
    const after = this.drafts;
    planHistory.push({
      undo: () => {
        this.drafts = before;
        this.#publish();
      },
      redo: () => {
        this.drafts = after;
        this.#publish();
      },
    });
  }

  /** A blank row, on screen and in edit mode before the server has heard of it. */
  add() {
    this.#commitEdit();
    const draft: ActivityDraft = { key: `new-${++cut}`, id: null, name: "", pieces: [] };
    const before = this.drafts;
    this.drafts = [draft, ...this.drafts];
    const after = this.drafts;
    this.focusKey = draft.key;
    this.#publish();

    // The row may become its own activity on the server by the time this is undone or redone —
    // a freshly added one is checked for and taken back off, then put back the same way.
    let archivedId: string | null = null;
    planHistory.push({
      undo: async () => {
        const current = this.drafts.find((d) => d.key === draft.key);
        if (current?.id) {
          archivedId = current.id;
          try {
            await archiveActivity(current.id);
            void store.activities.refresh();
          } catch {
            archivedId = null;
          }
        }
        this.drafts = before;
        this.#publish();
      },
      redo: async () => {
        this.drafts = after;
        this.#publish();
        if (archivedId) {
          try {
            await restoreActivity(archivedId);
            void store.activities.refresh();
          } catch {
            /* best effort — the next load will show the truth */
          }
          archivedId = null;
        }
      },
    });
  }

  update(key: string, patch: Partial<Pick<ActivityDraft, "name" | "pieces">>) {
    this.#beginEdit();
    this.drafts = this.drafts.map((d) => (d.key === key ? { ...d, ...patch } : d));
    this.#publish();
  }

  /**
   * Writes every changed row. The screen calls this a moment after the last edit, and it's already
   * showing the answer — what this adds is the id a new row was given, and the check behind it.
   */
  flush = async () => {
    this.#commitEdit();
    const changed = this.drafts.filter((d) => isDirty(d) && d.name.trim());
    if (changed.length === 0) return;
    this.saving = true;
    this.error = null;
    try {
      for (const draft of changed) {
        const weights = weightsOf(draft.pieces);
        const payload = { name: draft.name.trim(), weights };
        const written = draft.id ? await updateActivity(draft.id, payload) : await createActivity(payload);
        this.drafts = this.drafts.map((d) =>
          d.key === draft.key ? { ...d, id: written.id, saved: { name: payload.name, weights } } : d,
        );
      }
      this.#publish();
      // Not awaited: the rows on screen are already the ones just written.
      void store.activities.refresh();
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Couldn't save your activities";
    } finally {
      this.saving = false;
    }
  };

  archive = async (draft: ActivityDraft) => {
    const message = `Archive "${draft.name || "this activity"}"? It disappears from the list. Past entries stay.`;
    if (!confirm(message)) return;
    this.#commitEdit();
    const before = this.drafts;
    this.drafts = this.drafts.filter((d) => d.key !== draft.key);
    const after = this.drafts;
    this.#publish();

    if (!draft.id) {
      planHistory.push({
        undo: () => {
          this.drafts = before;
          this.#publish();
        },
        redo: () => {
          this.drafts = after;
          this.#publish();
        },
      });
      return;
    }

    // The guard above proved the row exists on the server, but the closures below outlive that
    // narrowing, so the id is held onto here rather than re-read from the draft.
    const id = draft.id;

    try {
      await archiveActivity(id);
      void store.activities.refresh();
      // Only a write that landed is worth taking back — a step for one that failed would undo
      // an archive that never happened.
      planHistory.push({
        undo: async () => {
          this.drafts = before;
          this.#publish();
          try {
            await restoreActivity(id);
            void store.activities.refresh();
          } catch {
            /* best effort — the next load will show the truth */
          }
        },
        redo: async () => {
          this.drafts = after;
          this.#publish();
          try {
            await archiveActivity(id);
            void store.activities.refresh();
          } catch {
            /* best effort — the next load will show the truth */
          }
        },
      });
    } catch (e) {
      // The row goes back where it was: it still exists, whatever the screen said for a moment.
      this.drafts = before;
      this.#publish();
      this.error = e instanceof Error ? e.message : "Couldn't archive that activity";
    }
  };
}

export const activitiesData = new ActivitiesData();
