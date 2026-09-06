import { diagnostics } from "./diagnostics.svelte";

/**
 * The last thing standing when the app's own reactivity dies.
 *
 * Svelte flushes every effect in one pass, so one effect that re-triggers itself doesn't fail
 * alone: the scheduler gives up and takes the whole tree with it. What is left on screen is the
 * last frame that was drawn — a calendar that still scrolls, a tab bar that no longer answers, and
 * no way at all to say so, because saying so would itself take a render. Twice now that has been
 * an app that looked like it was still loading.
 *
 * So this lives outside all of it. A timer nothing reactive can stop bumps a counter; an `$effect`
 * in the root layout reads the counter and stamps the time. If the stamp stops moving while the
 * timer keeps firing, the effects are gone — and the card that says so is built out of plain DOM
 * nodes, because every other way of putting something on screen here has just been proved unable.
 */

/** How often the timer looks. Small enough to notice, large enough to cost nothing. */
const TICK_MS = 2_000;
/** How long a stalled heartbeat is given before it counts as dead. */
const DEAD_MS = 8_000;
/** Lucide's `copy` and `refresh-cw`, drawn by hand — this card is built without Svelte. */
const ICON =
  'width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICON_COPY = `<svg ${ICON}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const ICON_RELOAD = `<svg ${ICON}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`;

/** The pile the app draws for every other failure — frozen, and worth hiding while this is up. */
const toasts = () => document.querySelector("[data-problem-toasts]");

/**
 * A gap this much longer than the tick means the whole page was suspended — a locked phone, a
 * backgrounded tab — and not that anything failed. Both clocks stopped, so neither says anything.
 */
const SLEPT_MS = TICK_MS * 3;

class Watchdog {
  /** Bumped by the timer; read by the heartbeat effect, which is the only reason it is state. */
  ping = $state(0);

  #lastBeat = 0;
  #lastTick = 0;
  #timer: ReturnType<typeof setInterval> | null = null;
  #card: HTMLElement | null = null;

  /** Called from the root layout's `$effect`, which is what is being watched. */
  beat() {
    this.#lastBeat = Date.now();
    this.#clear();
  }

  start() {
    if (this.#timer || typeof window === "undefined") return;
    this.#lastBeat = Date.now();
    this.#lastTick = Date.now();
    this.#timer = setInterval(() => this.#look(), TICK_MS);
  }

  #look() {
    const now = Date.now();
    const slept = now - this.#lastTick > SLEPT_MS;
    this.#lastTick = now;
    // Nothing ran while the page was away, this included — there is no evidence either way.
    if (slept || document.visibilityState !== "visible") this.#lastBeat = now;
    else if (now - this.#lastBeat > DEAD_MS) this.#show();
    this.ping = now;
  }

  /**
   * The card, built by hand out of the app's own classes: whatever draws the rest of the app has
   * stopped answering, so this is put on screen with plain DOM — but it is the same card the
   * corner draws for everything else, because two shapes for "it broke" is one too many. The
   * frozen pile behind it is hidden while this is up: those cards are stale by definition.
   */
  #show() {
    if (this.#card) return;

    const card = document.createElement("div");
    card.setAttribute("role", "alert");
    card.className = "safe-top fixed top-0 right-0 z-[2147483647] flex w-full max-w-sm items-center gap-0.5 p-3 md:p-4";
    card.innerHTML = `
      <div class="flex min-w-0 flex-1 items-center gap-0.5 rounded-xl border border-danger/40 bg-surface py-1.5 pr-1.5 pl-3 shadow-(--shadow-float)">
        <p class="t-label min-w-0 flex-1 truncate text-danger">Balance stopped responding</p>
        <button type="button" data-copy class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint" aria-label="Copy error details">${ICON_COPY}</button>
        <button type="button" data-reload class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint" aria-label="Reload">${ICON_RELOAD}</button>
      </div>`;

    card.querySelector("[data-copy]")?.addEventListener("click", () => {
      void navigator.clipboard?.writeText(diagnostics.asText).catch(() => {});
    });
    card.querySelector("[data-reload]")?.addEventListener("click", () => window.location.reload());

    document.body.appendChild(card);
    this.#card = card;
    toasts()?.setAttribute("hidden", "");
    diagnostics.report("App", "Reactivity stopped — every effect in the app was torn down.", {
      title: "Balance stopped responding",
    });
  }

  /** A heartbeat after a stall means it came back; the card has nothing left to say. */
  #clear() {
    if (!this.#card) return;
    this.#card.remove();
    this.#card = null;
    toasts()?.removeAttribute("hidden");
  }
}

export const watchdog = new Watchdog();
