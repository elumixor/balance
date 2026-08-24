import { untrack } from "svelte";
import { buildInfo } from "./build-info";
import { API_BASE_URL } from "./env";

/** One thing that went wrong, in the shape the banner shows it. */
export interface Problem {
  readonly id: number;
  readonly at: Date;
  /** What was being done — "Calendar", "Sign-in", "Sync". Groups repeats of the same failure. */
  readonly scope: string;
  readonly message: string;
  /** The technical half: a stack, a URL, a status. Behind the disclosure, never in the sentence. */
  readonly detail?: string;
  count: number;
}

/** More than this and the oldest goes: what matters is the last thing that failed, not the log. */
const KEPT = 20;

/**
 * Everything that failed where nobody was looking.
 *
 * A screen that can say what went wrong says it itself — a week that didn't load has its own card
 * with its own retry. This is for the rest: a promise nobody awaited, a render that threw, a
 * request made by a background loop. Those used to be a `console.error` in a webview with no
 * console attached, which is why an app that had quietly stopped working looked like an app that
 * was still loading.
 */
class Diagnostics {
  problems = $state<Problem[]>([]);
  /** Closed by hand; a new problem opens it again, since it is news by then. */
  dismissed = $state(false);
  #nextId = 1;
  #started = false;

  get latest() {
    return this.problems.at(-1) ?? null;
  }

  /** Whether there is something to show — one banner, however many problems are behind it. */
  get showing() {
    return !this.dismissed && this.problems.length > 0;
  }

  /**
   * Untracked throughout: reporting reads the list it is about to write to, and an `$effect` that
   * reports a failure would otherwise be re-running itself for as long as the app is open.
   */
  report(scope: string, error: unknown, detail?: string) {
    untrack(() => this.#report(scope, error, detail));
  }

  #report(scope: string, error: unknown, detail?: string) {
    const message = messageOf(error);
    const fullDetail = [detail, detailOf(error)].filter(Boolean).join("\n");
    // The same failure every 30 seconds from a loop that keeps retrying is one problem with a
    // count, not twenty entries pushing the first one off the end.
    const existing = this.problems.find((problem) => problem.scope === scope && problem.message === message);
    if (existing) {
      existing.count += 1;
      this.dismissed = false;
      return;
    }
    this.problems.push({
      id: this.#nextId++,
      at: new Date(),
      scope,
      message,
      detail: fullDetail || undefined,
      count: 1,
    });
    if (this.problems.length > KEPT) this.problems.shift();
    this.dismissed = false;
    console.error(`[${scope}]`, error);
  }

  dismiss() {
    this.dismissed = true;
  }

  clear() {
    this.problems = [];
    this.dismissed = false;
  }

  /**
   * Catches what the app itself never sees: a rejected promise nobody awaited, and an error thrown
   * outside a handler. Idempotent — the layout that starts this remounts on a hot reload.
   */
  start() {
    if (this.#started || typeof window === "undefined") return;
    this.#started = true;
    window.addEventListener("unhandledrejection", (event) => {
      this.report("App", event.reason);
    });
    window.addEventListener("error", (event) => {
      // A failed <img> or <script> fires here too, with no error attached and nothing to say.
      if (!event.error && !event.message) return;
      this.report("App", event.error ?? event.message);
    });
  }

  /** The state of the app itself, for the report somebody pastes into a message. */
  get context() {
    return [`api: ${API_BASE_URL || "(same origin)"}`, `build: ${buildInfo.parts.join(" · ")}`].join("\n");
  }

  /** Everything on screen as one block of text — see the banner's copy button. */
  get asText() {
    return [
      this.context,
      ...this.problems.map((problem) =>
        [
          `[${problem.at.toISOString()}] ${problem.scope}${problem.count > 1 ? ` ×${problem.count}` : ""}`,
          problem.message,
          problem.detail,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ].join("\n\n");
  }
}

export const diagnostics = new Diagnostics();

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function detailOf(error: unknown) {
  if (!(error instanceof Error)) return "";
  const stack = error.stack ?? "";
  // The first line of a stack is the message again, which the sentence above already carries.
  return stack.startsWith(`${error.name}: ${error.message}`)
    ? stack.slice(error.name.length + error.message.length + 2).trim()
    : stack;
}
