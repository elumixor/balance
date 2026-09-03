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
/** Both buttons on the hand-built card, which has no stylesheet to lean on. */
const BUTTON =
  "appearance:none;border:0;border-radius:8px;padding:6px 10px;background:#26262a;color:#f4f4f5;font:600 12px/1 -apple-system,system-ui,sans-serif;cursor:pointer";

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

  /** The card, built by hand: whatever draws the rest of the app has stopped answering. */
  #show() {
    if (this.#card) return;

    const card = document.createElement("div");
    card.setAttribute("role", "alert");
    card.style.cssText = [
      "position:fixed",
      "right:12px",
      "top:calc(env(safe-area-inset-top) + 12px)",
      "z-index:2147483647",
      "max-width:min(24rem,calc(100vw - 24px))",
      "display:flex",
      "align-items:center",
      "gap:8px",
      "padding:8px 8px 8px 12px",
      "border-radius:12px",
      "border:1px solid rgba(239,68,68,.45)",
      "background:#151517",
      "color:#f4f4f5",
      "font:500 13px/1.45 -apple-system,system-ui,sans-serif",
      "box-shadow:0 12px 32px rgba(0,0,0,.45)",
    ].join(";");

    // One line, the same as every other failure in this app: what actually broke is behind the
    // copy, because a card holding a page of it covers the screen it is trying to explain.
    const title = document.createElement("p");
    title.textContent = "Balance stopped responding";
    title.style.cssText =
      "margin:0;min-width:0;flex:1;color:#f87171;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.style.cssText = BUTTON;
    copy.onclick = () => void navigator.clipboard?.writeText(diagnostics.asText).catch(() => {});

    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "Reload";
    reload.style.cssText = BUTTON;
    reload.onclick = () => window.location.reload();

    card.append(title, copy, reload);
    document.body.appendChild(card);
    this.#card = card;
    diagnostics.report("App", "Reactivity stopped — every effect in the app was torn down.", {
      title: "Balance stopped responding",
    });
  }

  /** A heartbeat after a stall means it came back; the card has nothing left to say. */
  #clear() {
    if (!this.#card) return;
    this.#card.remove();
    this.#card = null;
  }
}

export const watchdog = new Watchdog();
