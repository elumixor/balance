import { getSessionSummary } from "$lib/queries";
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

  async enter(slot: Slot) {
    if (this.summary?.slot === slot && !this.error) return;
    this.slot = slot;
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      this.summary = await getSessionSummary(this.slot, deviceTimeZone());
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Couldn't open your session.";
    } finally {
      this.loading = false;
    }
  }
}

export const sessionData = new SessionData();
