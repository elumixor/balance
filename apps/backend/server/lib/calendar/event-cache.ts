import type { ExternalEvent } from "./types";

const TTL_MS = 30_000;
const MAX_ENTRIES = 200;

/**
 * Nothing about an event is stored — Google is the source of truth — but the calendar screen and
 * the balance screen ask for overlapping ranges within the same second, and a warm instance can
 * answer a page reload without going out again. Holding the *promise* rather than the result is
 * what makes two simultaneous asks share one Google call.
 */
class EventCache {
  readonly #entries = new Map<string, { readonly at: number; readonly events: Promise<ExternalEvent[]> }>();
  readonly #generations = new Map<string, number>();

  fetch(
    userId: string,
    calendarId: string,
    from: Date,
    to: Date,
    load: () => Promise<ExternalEvent[]>,
  ): Promise<ExternalEvent[]> {
    const generation = this.#generations.get(userId) ?? 0;
    const key = `${userId}|${generation}|${calendarId}|${from.toISOString()}|${to.toISOString()}`;

    const hit = this.#entries.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.events;

    // A failed request must not be remembered, or the next try is served the same failure.
    const events = load().catch((e) => {
      this.#entries.delete(key);
      throw e;
    });
    this.#entries.set(key, { at: Date.now(), events });
    this.#evictOldest();
    return events;
  }

  /** Called by every write, so a created, moved or deleted event is never served from a memo. */
  invalidate(userId: string): void {
    this.#generations.set(userId, (this.#generations.get(userId) ?? 0) + 1);
  }

  #evictOldest(): void {
    while (this.#entries.size > MAX_ENTRIES) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) return;
      this.#entries.delete(oldest);
    }
  }
}

export const eventCache = new EventCache();
