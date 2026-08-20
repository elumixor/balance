import * as persist from "./persist";

/**
 * One fetch per thing per app session, and one copy of it kept on the device.
 *
 * Every screen mounts fresh on navigation, so screens that fetch on mount refetch the same
 * rows every time a tab is tapped — half a second of skeleton for data the app already had.
 * A `Cached` lives at module scope instead: the first screen to want it pays for the request,
 * every later screen reads the value it already holds. Writes push their result straight in,
 * so the list is right without a round trip.
 *
 * Given a `key`, the value survives the app closing too. It's read back in the constructor —
 * synchronously, before the first frame — and marked stale, so the screen opens on the rows
 * from last time and the request that checks them runs behind what's already on screen.
 */
export class Cached<T> {
  value = $state<T | undefined>(undefined);
  /** Distinguishes "never fetched" from "fetched, and the answer was `null`". */
  hasValue = $state(false);
  loading = $state(false);
  error = $state<string | null>(null);

  /**
   * A request out behind rows that are already on screen — what the tab's spinner is about.
   * A first load isn't this: the screen is showing a skeleton, which says the same thing louder.
   */
  readonly syncing = $derived(this.loading && this.hasValue);

  /** Set by a write that invalidated this; the next `ensure()` refetches behind the old value. */
  #stale = $state(false);
  #inflight: Promise<void> | null = null;
  readonly #key: string | undefined;

  constructor(
    private readonly fetcher: () => Promise<T>,
    private readonly fallbackError: string,
    key?: string,
  ) {
    this.#key = key;
    if (key === undefined) return;
    const stored = persist.read<T>(key);
    if (stored === undefined) return;
    this.value = stored;
    this.hasValue = true;
    // What's on disk is what the server said last time the app was open, which is exactly the
    // thing that might have changed since. Show it, then check it.
    this.#stale = true;
  }

  /** Fetches only what's missing or stale. Safe to call on every mount — that's the point. */
  ensure() {
    if (this.hasValue && !this.#stale) return this.#inflight ?? Promise.resolve();
    return this.refresh();
  }

  /** Refetches unconditionally, keeping the current value on screen while the request is out. */
  refresh() {
    this.#inflight ??= this.#fetch().finally(() => (this.#inflight = null));
    return this.#inflight;
  }

  async #fetch() {
    this.loading = true;
    try {
      this.set(await this.fetcher());
    } catch (e) {
      this.error = e instanceof Error ? e.message : this.fallbackError;
    } finally {
      this.loading = false;
    }
  }

  set(value: T) {
    this.value = value;
    this.hasValue = true;
    this.#stale = false;
    this.error = null;
    if (this.#key !== undefined) persist.write(this.#key, value, Date.now());
  }

  /**
   * A value the caller worked out itself — a write's own answer folded into what's held — rather
   * than one the server just gave for the whole thing. Whether this is still worth checking is
   * exactly what it was a moment ago, so `set`'s claim of freshness would be a different fact.
   */
  patch(value: T) {
    this.value = value;
    this.hasValue = true;
    this.error = null;
    if (this.#key !== undefined) persist.write(this.#key, value, Date.now());
  }

  /** Marks the value worth refetching without blanking the screen that's showing it. */
  invalidate() {
    this.#stale = true;
  }

  /** Back to never-fetched — for sign-out, where the next account must not see these rows. */
  clear() {
    this.value = undefined;
    this.hasValue = false;
    this.error = null;
    this.#stale = false;
    if (this.#key !== undefined) persist.drop(this.#key);
  }
}
