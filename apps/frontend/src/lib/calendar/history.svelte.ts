import { diagnostics } from "$lib/platform/diagnostics.svelte";

/**
 * What the last few calendar writes were, so ⌘Z can take them back.
 *
 * There is no local copy of the calendar to rewind — Google holds the events — so an undo is a
 * write of its own: the entry that recorded a move remembers where the block came from and puts
 * it back. The block moves the moment ⌘Z is pressed — the write behind it is drawn ahead like
 * every other — so the only thing a step's answer is needed for is the write that fails.
 */
export interface HistoryStep {
  /** Puts the world back the way it was. `false` when the write failed and the week didn't. */
  undo(): Promise<boolean>;
  redo(): Promise<boolean>;
}

/** Old enough entries point at events that may not exist any more; a few dozen is plenty. */
const LIMIT = 50;

export class CalendarHistory {
  #past = $state<HistoryStep[]>([]);
  #future = $state<HistoryStep[]>([]);

  readonly canUndo = $derived(this.#past.length > 0);
  readonly canRedo = $derived(this.#future.length > 0);

  /** A fresh write is a new branch of history — whatever was undone can't be redone past it. */
  push(step: HistoryStep) {
    this.#past = [...this.#past, step].slice(-LIMIT);
    this.#future = [];
  }

  clear() {
    this.#past = [];
    this.#future = [];
  }

  undo() {
    return this.#step(true);
  }

  redo() {
    return this.#step(false);
  }

  /**
   * The step moves stacks at once and its write runs behind it, so holding ⌘Z walks back through
   * the week as fast as it's pressed rather than a round trip at a time. The writes themselves are
   * queued in order by the caller, so they land the way they were pressed.
   */
  #step(undoing: boolean) {
    const from = undoing ? this.#past : this.#future;
    const step = from.at(-1);
    if (!step) return;

    if (undoing) {
      this.#past = from.slice(0, -1);
      this.#future = [...this.#future, step];
    } else {
      this.#future = from.slice(0, -1);
      this.#past = [...this.#past, step];
    }

    // A write that failed leaves the calendar somewhere neither stack describes any more, and the
    // refetch it ends with is what the week really holds. Nothing left to undo from here. A step
    // that threw is the same failure without the refetch, and the only one that has to be said.
    void (undoing ? step.undo() : step.redo()).then(
      (moved) => {
        if (!moved) this.clear();
      },
      (error: unknown) => {
        diagnostics.report("Calendar", error, { title: "Couldn’t undo that" });
        this.clear();
      },
    );
  }
}
