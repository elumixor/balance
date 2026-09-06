/**
 * A small in-memory memo with an age limit and a ceiling on how much it holds.
 *
 * Every cache here has the same three needs: answer the same question twice without asking twice,
 * forget an answer once it is old, and never grow without bound in a process that may live for a
 * day. Eviction is oldest-in first, which is what a `Map` already keeps track of.
 */
export class TtlCache<T> {
  readonly #entries = new Map<string, { readonly at: number; readonly value: T }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string): T | undefined {
    const hit = this.#entries.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at >= this.ttlMs) {
      this.#entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.#entries.set(key, { at: Date.now(), value });
    while (this.#entries.size > this.maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) return;
      this.#entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }

  /** Forgets every entry whose key starts with `prefix` — one account's worth, typically. */
  invalidate(prefix: string): void {
    for (const key of this.#entries.keys()) if (key.startsWith(prefix)) this.#entries.delete(key);
  }
}
