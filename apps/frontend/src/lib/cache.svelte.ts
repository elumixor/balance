/**
 * One fetch per thing per app session.
 *
 * Every screen mounts fresh on navigation, so screens that fetch on mount refetch the same
 * rows every time a tab is tapped — half a second of skeleton for data the app already had.
 * A `Cached` lives at module scope instead: the first screen to want it pays for the request,
 * every later screen reads the value it already holds, and a page reload starts over from
 * scratch. Writes push their result straight in, so the list is right without a round trip.
 */
export class Cached<T> {
  value = $state<T | undefined>(undefined);
  /** Distinguishes "never fetched" from "fetched, and the answer was `null`". */
  hasValue = $state(false);
  loading = $state(false);
  error = $state<string | null>(null);

  /** Set by a write that invalidated this; the next `ensure()` refetches behind the old value. */
  #stale = $state(false);
  #inflight: Promise<void> | null = null;

  constructor(
    private readonly fetcher: () => Promise<T>,
    private readonly fallbackError: string,
  ) {}

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
  }
}
