import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as persist from "./persist";

const PREFIX = "balance:v2";
const DAY_MS = 86_400_000;

/**
 * A `localStorage` the test can break on purpose. The real one in the runner can't be made to
 * refuse a write, and refusing is most of what `persist` is written to survive.
 */
class FakeStorage implements Storage {
  #entries = new Map<string, string>();
  failWrites = false;

  get length() {
    return this.#entries.size;
  }
  key(index: number) {
    return [...this.#entries.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.#entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException("quota", "QuotaExceededError");
    this.#entries.set(key, value);
  }
  removeItem(key: string) {
    this.#entries.delete(key);
  }
  clear() {
    this.#entries.clear();
  }
}

let storage: FakeStorage;

function useStorage(value: unknown) {
  Object.defineProperty(globalThis, "localStorage", { value, configurable: true, writable: true });
}

beforeEach(() => {
  storage = new FakeStorage();
  useStorage(storage);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 14, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("read and write", () => {
  it("gives back what was written", () => {
    persist.write("week:2026-08-10", { events: [1, 2, 3] }, Date.now());
    expect(persist.read("week:2026-08-10")).toEqual({ events: [1, 2, 3] });
  });

  it("is a miss for a key nobody wrote", () => {
    expect(persist.read("week:nothing")).toBeUndefined();
  });

  it("is a miss rather than a crash for an entry an older build wrote", () => {
    storage.setItem(`${PREFIX}:week:x`, "not json at all");
    expect(persist.read("week:x")).toBeUndefined();
    storage.setItem(`${PREFIX}:week:y`, JSON.stringify({ v: { events: [] } }));
    expect(persist.read("week:y")).toBeUndefined();
  });

  it("stops trusting an entry once it's a week old", () => {
    persist.write("week:old", { events: [] }, Date.now() - 7 * DAY_MS - 1);
    expect(persist.read("week:old")).toBeUndefined();
    persist.write("week:fresh", { events: [] }, Date.now() - 6 * DAY_MS);
    expect(persist.read("week:fresh")).toEqual({ events: [] });
  });

  it("drops one key without touching the others", () => {
    persist.write("a", 1, Date.now());
    persist.write("b", 2, Date.now());
    persist.drop("a");
    expect(persist.read("a")).toBeUndefined();
    expect(persist.read("b")).toBe(2);
  });
});

describe("a storage that refuses", () => {
  it("reads as empty rather than throwing, the way Safari's blocked storage does", () => {
    // Reaching for `localStorage` at all is what throws when the browser has blocked it, so
    // every entry point has to survive the reach, not just the read.
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    expect(persist.read("anything")).toBeUndefined();
    expect(persist.storedOwner()).toBeNull();
    expect(persist.adoptOwner("user_1")).toBe(false);
    expect(() => persist.write("a", 1, Date.now())).not.toThrow();
    expect(() => persist.drop("a")).not.toThrow();
    expect(() => persist.wipe()).not.toThrow();
    expect(() => persist.prune("week:", 2)).not.toThrow();
  });

  it("survives having no storage at all, which is what a server render has", () => {
    useStorage(undefined);
    expect(persist.read("anything")).toBeUndefined();
    expect(persist.storedOwner()).toBeNull();
    expect(persist.adoptOwner("user_1")).toBe(false);
  });

  it("makes room when it's full instead of losing the write silently forever", () => {
    persist.write("week:1", "a", Date.now() - 3 * DAY_MS);
    persist.write("week:2", "b", Date.now() - 2 * DAY_MS);
    persist.write("week:3", "c", Date.now() - 1 * DAY_MS);

    storage.failWrites = true;
    persist.write("week:4", "d", Date.now());
    // The oldest weeks went, so the next attempt has somewhere to go.
    expect(persist.read("week:1")).toBeUndefined();
    storage.failWrites = false;
    persist.write("week:4", "d", Date.now());
    expect(persist.read("week:4")).toBe("d");
  });
});

describe("owner", () => {
  it("drops rows nobody had claimed, and reports that nobody else owned them", () => {
    // Data with no owner is data from a build before owners existed. It can't be shown to
    // whoever signs in now, but there is no previous account for the caller to clear up after.
    persist.write("week:1", "a", Date.now());
    expect(persist.adoptOwner("user_1")).toBe(false);
    expect(persist.storedOwner()).toBe("user_1");
    expect(persist.read("week:1")).toBeUndefined();
  });

  it("says nothing changed when the same person comes back", () => {
    persist.adoptOwner("user_1");
    persist.write("week:1", "a", Date.now());
    expect(persist.adoptOwner("user_1")).toBe(false);
    expect(persist.read("week:1")).toBe("a");
  });

  it("takes the last account's rows with it when a different one signs in", () => {
    persist.adoptOwner("user_1");
    persist.write("week:1", "a", Date.now());
    expect(persist.adoptOwner("user_2")).toBe(true);
    expect(persist.read("week:1")).toBeUndefined();
    expect(persist.storedOwner()).toBe("user_2");
  });
});

describe("wipe and prune", () => {
  it("wipe leaves nothing of this app's but keeps who it belongs to", () => {
    persist.adoptOwner("user_1");
    persist.write("week:1", "a", Date.now());
    storage.setItem("someone-else", "keep me");
    persist.wipe();
    expect(persist.read("week:1")).toBeUndefined();
    expect(persist.storedOwner()).toBe("user_1");
    expect(storage.getItem("someone-else")).toBe("keep me");
  });

  it("prune keeps the newest and drops the rest, counting only its own prefix", () => {
    for (let i = 0; i < 5; i++) persist.write(`week:${i}`, i, Date.now() - i * 1000);
    persist.write("calendars", "keep", Date.now() - 99_000);
    persist.prune("week:", 2);
    expect(persist.read("week:0")).toBe(0);
    expect(persist.read("week:1")).toBe(1);
    expect(persist.read("week:2")).toBeUndefined();
    expect(persist.read("calendars")).toBe("keep");
  });

  it("prune treats an entry it can't date as the oldest rather than giving up", () => {
    persist.write("week:good", 1, Date.now());
    storage.setItem(`${PREFIX}:week:unreadable`, "{{{");
    storage.setItem(`${PREFIX}:week:undated`, JSON.stringify({ v: "no timestamp" }));
    persist.prune("week:", 1);
    expect(persist.read("week:good")).toBe(1);
    expect(storage.getItem(`${PREFIX}:week:unreadable`)).toBeNull();
    expect(storage.getItem(`${PREFIX}:week:undated`)).toBeNull();
  });
});
