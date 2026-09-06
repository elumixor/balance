import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { getProgress } from "./queries";
import type { StarProgress } from "./types";
import { deviceTimeZone } from "./zone";

/**
 * The record behind the star: read once for the badge, again whenever a day is committed.
 *
 * Not a `Cached` in the store: the badge is on every screen, so the count is wanted the moment
 * there is a session, and nothing on a screen writes to it — a commit on the planning strip
 * asks for it again, which is the one moment it can move.
 */
class ProgressData {
  value = $state<StarProgress | null>(null);
  loading = $state(false);
  #asked = false;

  /** The count on the badge: what was last read, or nothing until it has been. */
  get stars() {
    return this.value?.rank.stars ?? null;
  }

  /** Reads once per session; a second call is free. */
  ensure() {
    if (this.#asked) return;
    this.#asked = true;
    void this.refresh();
  }

  async refresh() {
    this.loading = true;
    try {
      this.value = await getProgress(deviceTimeZone());
    } catch (e) {
      this.#asked = false;
      diagnostics.report("Stars", e, { title: "Couldn’t read your stars", retry: () => this.refresh() });
    } finally {
      this.loading = false;
    }
  }

  /** The next account starts from nothing. */
  reset() {
    this.value = null;
    this.#asked = false;
  }
}

export const progressData = new ProgressData();
