/**
 * What the last few calendar writes were, so ⌘Z can take them back.
 *
 * There is no local copy of the calendar to rewind — Google holds the events — so an undo is a
 * write of its own: the entry that recorded a move remembers where the block came from and puts
 * it back. That also means an undo can fail the way any write can, which is why every step
 * answers with whether it worked, and a step that didn't leaves the stacks where they were.
 */
export interface HistoryStep {
  /** Puts the world back the way it was. `false` when the write failed and nothing moved. */
  undo(): Promise<boolean>;
  redo(): Promise<boolean>;
}

/** Old enough entries point at events that may not exist any more; a few dozen is plenty. */
const LIMIT = 50;

export class CalendarHistory {
  #past = $state<HistoryStep[]>([]);
  #future = $state<HistoryStep[]>([]);
  /** One undo at a time: two writes racing to the same event would land in either order. */
  #running = false;

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

  async #step(undoing: boolean) {
    if (this.#running) return;
    const from = undoing ? this.#past : this.#future;
    const step = from.at(-1);
    if (!step) return;

    this.#running = true;
    try {
      // Popped first: the write it runs must not see itself as the next thing to undo.
      if (undoing) this.#past = from.slice(0, -1);
      else this.#future = from.slice(0, -1);

      const moved = await (undoing ? step.undo() : step.redo());
      // A write that failed changed nothing, so the step stays on the side it came from.
      if (undoing && moved) this.#future = [...this.#future, step];
      else if (undoing) this.#past = [...this.#past, step];
      else if (moved) this.#past = [...this.#past, step];
      else this.#future = [...this.#future, step];
    } finally {
      this.#running = false;
    }
  }
}
