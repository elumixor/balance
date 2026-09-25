import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { ApiClientError, NotSignedInError } from "./api";
import * as persist from "./persist";

/**
 * How long a request that never reached the server waits before it is made again.
 *
 * The Mac is a login item: its five-minute check fires as the lid closes and is aborted twenty
 * seconds of wall clock later, which is the moment the lid opens again — before Wi-Fi is back.
 * A request that was refused is a fact; one that was lost in transit is asked once more, with
 * enough of a pause for the network to come up, and only then counts as a failure.
 */
export const RETRY_DELAY_MS = 5_000;

/** Never reached the server — offline, DNS, aborted mid-sleep — as opposed to being told no. */
function neverArrived(e: unknown) {
  return e instanceof ApiClientError && !(e instanceof NotSignedInError) && e.status === undefined;
}

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
  /**
   * Bumped by every invalidation, so an answer can be asked whether it was sent before one.
   * A write that lands while a read is out describes a world that read never saw, and the read's
   * own answer would otherwise report the value as checked and current.
   */
  #generation = 0;
  #inflight: Promise<void> | null = null;
  readonly #key: string | undefined;

  /**
   * What the card calls this when it fails — "Calendars", "Settings", "Week". Every cache reports:
   * the corner is the app's one way of saying something went wrong, and a screen that drew its own
   * card for this was a second answer to the same question, in a shape that couldn't hold it.
   */
  readonly #scope: string | undefined;

  constructor(
    private readonly fetcher: () => Promise<T>,
    private readonly fallbackError: string,
    key?: string,
    scope?: string,
  ) {
    this.#scope = scope;
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
    const generation = this.#generation;
    try {
      this.set(await this.#ask());
      // Invalidated while this was in flight: the value is newer than what was on screen, and
      // still older than the write that came in behind it.
      if (generation !== this.#generation) this.#stale = true;
    } catch (e) {
      // Asked before there was a session to ask with: not a failure and not an answer either, so
      // the value stays unfetched and this refetches when `warmStore` runs behind the sign-in.
      if (e instanceof NotSignedInError) return;
      this.error = e instanceof Error ? e.message : this.fallbackError;
      // The card says what this cache is for and carries the way out, since this is the thing
      // that knows how to ask again. The fallback sentence was always written for a person.
      diagnostics.report(this.#scope ?? "Loading", e, {
        title: this.fallbackError.replace(/\.$/, ""),
        retry: () => this.refresh(),
      });
    } finally {
      this.loading = false;
    }
  }

  /** The fetcher, asked a second time when the first request was lost rather than refused. */
  async #ask() {
    try {
      return await this.fetcher();
    } catch (e) {
      if (!neverArrived(e)) throw e;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return await this.fetcher();
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
    this.#generation += 1;
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
