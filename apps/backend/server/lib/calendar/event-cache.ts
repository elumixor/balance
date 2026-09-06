import { TtlCache } from "~/lib/ttl-cache";
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
  readonly #entries = new TtlCache<Promise<ExternalEvent[]>>(TTL_MS, MAX_ENTRIES);

  fetch(
    userId: string,
    calendarId: string,
    from: Date,
    to: Date,
    load: () => Promise<ExternalEvent[]>,
  ): Promise<ExternalEvent[]> {
    const key = `${userId}|${calendarId}|${from.toISOString()}|${to.toISOString()}`;
    const hit = this.#entries.get(key);
    if (hit) return hit;

    // A failed request must not be remembered, or the next try is served the same failure.
    const events = load().catch((e) => {
      this.#entries.delete(key);
      throw e;
    });
    this.#entries.set(key, events);
    return events;
  }

  /** Called by every write, so a created, moved or deleted event is never served from a memo. */
  invalidate(userId: string): void {
    this.#entries.invalidate(`${userId}|`);
  }
}

export const eventCache = new EventCache();
