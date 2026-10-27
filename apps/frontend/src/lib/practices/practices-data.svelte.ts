import { store } from "$lib/core/store.svelte";
import { practices, synced } from "$lib/core/synced.svelte";
import type { Practice } from "./types";

/** How long after the last keystroke an edit burst counts as finished — one press of undo. */
const BURST_MS = 700;

/**
 * The practices under each sphere and what the calendar says each has had. Every row is a synced
 * record, so there is nothing to save; the adherence comes from `store.progress`.
 */
class PracticesData {
  #burst: ReturnType<typeof setTimeout> | null = null;
  #open = false;

  /** The row that should open its name for typing — consumed once by that row. */
  focusId = $state<string | null>(null);

  ready = $derived(practices.ready);
  progress = $derived(store.progress.value ?? null);

  of(categoryId: string): Practice[] {
    return practices.all.filter((practice) => practice.categoryId === categoryId);
  }

  enter = () => Promise.all([synced.ensure(), store.progress.ensure()]);

  create(categoryId: string) {
    this.#closeBurst();
    const created = practices.create({ categoryId, name: "", unit: "times", targetPerWeek: 7 });
    this.focusId = created.id;
    return created;
  }

  update(id: string, patch: Partial<Practice>) {
    if (!this.#open) {
      this.#open = true;
      synced.beginStep();
    }
    practices.update(id, patch);
    if (this.#burst) clearTimeout(this.#burst);
    this.#burst = setTimeout(() => this.#closeBurst(), BURST_MS);
  }

  remove(id: string) {
    this.#closeBurst();
    practices.delete(id);
  }

  #closeBurst() {
    if (this.#burst) clearTimeout(this.#burst);
    this.#burst = null;
    if (!this.#open) return;
    this.#open = false;
    synced.commitStep();
  }
}

export const practicesData = new PracticesData();
