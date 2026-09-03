import { untrack } from "svelte";
import { diagnostics } from "$lib/diagnostics.svelte";
import { getSessionSummary } from "$lib/queries";
import { telemetry } from "$lib/telemetry";
import type { SessionSummary, Slot } from "./types";
import { deviceTimeZone } from "./zone";

/**
 * The session on screen: one ask, one answer.
 *
 * Not a `Cached` like the tab screens. A session is opened once, from a notification, and what it
 * says is a statement about a day that has just ended — showing yesterday's copy from the device's
 * store while today's loads behind it would be showing the wrong day's words entirely.
 */
class SessionData {
  slot = $state<Slot>("evening");
  summary = $state<SessionSummary | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  /** Where the review's category bar is drawn from — hours first, biggest first. */
  readonly categories = $derived((this.summary?.review.categories ?? []).filter((category) => category.hours > 0));

  /**
   * Asks for a slot, once.
   *
   * Untracked throughout, because the screen calls this from an `$effect` and every field it looks
   * at here is one loading writes to. Tracked, a failed load was a loop: the effect read `error`,
   * the load that answered it cleared `error`, and the effect ran again — until Svelte gave up on
   * every effect in the app, which reads as tabs that have stopped answering.
   */
  async enter(slot: Slot) {
    if (untrack(() => this.summary?.slot === slot && !this.error)) return;
    this.slot = slot;
    await this.load();
  }

  /** Asks again for the slot already on screen — after a commit, or from a retry button. */
  refresh() {
    return this.load();
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const summary = await getSessionSummary(
        untrack(() => this.slot),
        deviceTimeZone(),
      );
      this.summary = summary;
      telemetry.event("session_loaded", { slot: summary.slot, planned: summary.target.planned });
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Couldn't open your session.";
      diagnostics.report("Session", e, { title: "Couldn’t open your session", retry: () => this.load() });
    } finally {
      this.loading = false;
    }
  }
}

export const sessionData = new SessionData();
