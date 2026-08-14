/**
 * What the last few Planning edits were, so ⌘Z can take them back — categories and activities
 * share one stack, since they're one screen and an undo should walk back through whichever of
 * the two was touched last, not two separate histories the user has to keep straight.
 */
export interface PlanStep {
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
}

const LIMIT = 50;

export class PlanHistory {
  #past = $state<PlanStep[]>([]);
  #future = $state<PlanStep[]>([]);

  readonly canUndo = $derived(this.#past.length > 0);
  readonly canRedo = $derived(this.#future.length > 0);

  /** A fresh edit is a new branch of history — whatever was undone can't be redone past it. */
  push(step: PlanStep) {
    this.#past = [...this.#past, step].slice(-LIMIT);
    this.#future = [];
  }

  clear() {
    this.#past = [];
    this.#future = [];
  }

  undo() {
    this.#step(true);
  }

  redo() {
    this.#step(false);
  }

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

    void (undoing ? step.undo() : step.redo());
  }
}

export const planHistory = new PlanHistory();
