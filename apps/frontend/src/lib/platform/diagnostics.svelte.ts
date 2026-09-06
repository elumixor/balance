import { untrack } from "svelte";
import { buildInfo } from "$lib/core/build-info";
import { API_BASE_URL } from "$lib/core/env";
import { telemetry } from "./telemetry";

/** One thing that went wrong, in the shape the card shows it. */
export interface Problem {
  readonly id: number;
  readonly at: Date;
  /** What was being done — "Calendar", "Sign-in", "Sync". Groups repeats of the same failure. */
  readonly scope: string;
  /** The whole of what the card says: a sentence a person can act on, never a server's words. */
  readonly title: string;
  /** What actually failed, in the words it failed in. Behind the copy button, never on screen. */
  readonly message: string;
  /** The technical half: a stack, a URL, a status. Behind the copy button, never in the sentence. */
  readonly detail?: string;
  /** What would fix it, if anything can — the card grows a button and clears itself when it works. */
  retry?: () => unknown;
}

/** What a caller knows about a failure beyond the error itself. */
interface ReportOptions {
  /** What to put on the card — a sentence for a person. Without one the card says nothing useful. */
  title?: string;
  detail?: string;
  retry?: () => unknown;
}

/** More than this and the oldest goes: what matters is the last thing that failed, not the log. */
const KEPT = 20;

/**
 * Everything that failed, wherever it failed.
 *
 * There is one place in this app that says something went wrong, and it is the corner: a promise
 * nobody awaited, a render that threw, a week that didn't load, a write the server refused. Screens
 * used to say it themselves, each in its own shape and its own corner, which is how a card meant to
 * hold a sentence ended up holding a database query and covering the week it was about.
 *
 * A failure a screen can undo travels with its `retry`, so the one card carries the way out too.
 */
class Diagnostics {
  problems = $state<Problem[]>([]);
  #nextId = 1;
  #started = false;

  get latest() {
    return this.problems.at(-1) ?? null;
  }

  /** Whether there is anything to show — one card per problem, newest at the top. */
  get showing() {
    return this.problems.length > 0;
  }

  /**
   * Untracked throughout: reporting reads the list it is about to write to, and an `$effect` that
   * reports a failure would otherwise be re-running itself for as long as the app is open.
   */
  report(scope: string, error: unknown, options?: ReportOptions) {
    untrack(() => this.#report(scope, error, options));
  }

  #report(scope: string, error: unknown, options?: ReportOptions) {
    const message = messageOf(error);
    const fullDetail = [options?.detail, detailOf(error)].filter(Boolean).join("\n");
    // The same failure every 30 seconds from a loop that keeps retrying is that many failures,
    // each with its own time and its own stack. The card shows them as one leaning pile rather
    // than a number, because "×12" was never something anybody could act on.
    this.problems.push({
      id: this.#nextId++,
      at: new Date(),
      scope,
      title: options?.title ?? "Something went wrong",
      message,
      detail: fullDetail || undefined,
      retry: options?.retry,
    });
    if (this.problems.length > KEPT) this.problems.shift();
    console.error(`[${scope}]`, error);
    // The card is what the person sees; this is what the person fixing it sees. Every failure
    // the app knows how to say already comes through here, so there is nothing else to remember.
    telemetry.capture(scope, error, fullDetail || undefined);
  }

  /**
   * A pile closed by hand — every failure under it, since the pile is what a person sees as one
   * thing. They are gone rather than hidden, which is why the copy comes before the close.
   */
  dismiss(...ids: number[]) {
    const closing = new Set(ids);
    this.problems = this.problems.filter((problem) => !closing.has(problem.id));
  }

  clear() {
    this.problems = [];
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

  /**
   * One problem in full — the sentence the card truncates, the stack it never shows, and the state
   * of the app around it, which is the half nobody thinks to include when they report it by hand.
   */
  textOf(problem: Problem) {
    return [this.context, entryOf(problem)].join("\n\n");
  }

  /** Everything that has failed this session as one block of text. */
  get asText() {
    return [this.context, ...this.problems.map(entryOf)].join("\n\n");
  }
}

export const diagnostics = new Diagnostics();

function entryOf(problem: Problem) {
  return [`[${problem.at.toISOString()}] ${problem.scope}`, problem.title, problem.message, problem.detail]
    .filter(Boolean)
    .join("\n");
}

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
