import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { NotSignedInError } from "./api";
import { Cached } from "./cache.svelte";
import * as persist from "./persist";

/** A fetcher whose answers the test hands out one at a time. */
function deferred<T>() {
  const calls: { resolve: (value: T) => void; reject: (reason: Error) => void }[] = [];
  const fetcher = vi.fn(
    () =>
      new Promise<T>((resolve, reject) => {
        calls.push({ resolve, reject });
      }),
  );
  return { calls, fetcher };
}

beforeEach(() => {
  localStorage.clear();
  diagnostics.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ensure", () => {
  it("fetches once for the whole session, however many screens ask", async () => {
    const cached = new Cached(async () => "rows", "nope");
    await Promise.all([cached.ensure(), cached.ensure()]);
    await cached.ensure();
    expect(cached.value).toBe("rows");
    expect(cached.hasValue).toBe(true);
  });

  it("joins the request already out rather than starting a second one", async () => {
    const { calls, fetcher } = deferred<string>();
    const cached = new Cached(fetcher, "nope");
    const both = Promise.all([cached.ensure(), cached.refresh()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    calls[0].resolve("rows");
    await both;
    expect(cached.value).toBe("rows");
  });

  it("tells a first load apart from a check behind rows already on screen", async () => {
    const { calls, fetcher } = deferred<string>();
    const cached = new Cached(fetcher, "nope");
    const first = cached.ensure();
    expect(cached.loading).toBe(true);
    expect(cached.syncing).toBe(false);
    calls[0].resolve("rows");
    await first;

    cached.invalidate();
    const second = cached.ensure();
    expect(cached.syncing).toBe(true);
    calls[1].resolve("rows again");
    await second;
    expect(cached.syncing).toBe(false);
  });

  it("keeps a null answer rather than asking again for it", async () => {
    const fetcher = vi.fn(async () => null);
    const cached = new Cached(fetcher, "nope");
    await cached.ensure();
    await cached.ensure();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cached.hasValue).toBe(true);
  });
});

describe("failure", () => {
  it("keeps what's on screen and says what went wrong", async () => {
    const { calls, fetcher } = deferred<string>();
    const cached = new Cached(fetcher, "Couldn't load that week.");
    const first = cached.ensure();
    calls[0].resolve("rows");
    await first;

    cached.invalidate();
    const second = cached.refresh();
    calls[1].reject(new Error("offline"));
    await second;
    expect(cached.value).toBe("rows");
    expect(cached.error).toBe("offline");
    expect(cached.loading).toBe(false);
  });

  /**
   * A request made before there was a session to make it with. The app is on its way to the
   * sign-in screen, and a card about it there is a card about the screen the person is looking at.
   */
  it("says nothing about a request made before there was a session", async () => {
    const cached = new Cached(() => Promise.reject(new NotSignedInError()), "Couldn't load that week.");
    await cached.ensure();
    expect(cached.error).toBeNull();
    expect(cached.hasValue).toBe(false);
    expect(diagnostics.problems).toHaveLength(0);
  });

  it("falls back to the message the screen can use when the failure has none", async () => {
    const cached = new Cached(
      () => Promise.reject("a string, thrown by something that isn't an Error"),
      "Couldn't load that week.",
    );
    await cached.ensure();
    expect(cached.error).toBe("Couldn't load that week.");
  });

  /**
   * Every failure reaches the one card, named by the scope the cache was given — the settings
   * behind a dialog nobody has open, the list of calendars, the week itself. Failing quietly is
   * how these stopped working without anybody being told.
   */
  it("reports a failure under the scope it was given", async () => {
    const cached = new Cached(() => Promise.reject(new Error("offline")), "nope", undefined, "Settings");
    await cached.ensure();
    expect(diagnostics.latest?.scope).toBe("Settings");
    expect(diagnostics.latest?.message).toBe("offline");
  });

  it("reports a nameless cache's failure too, rather than letting it pass unsaid", async () => {
    const cached = new Cached(() => Promise.reject(new Error("offline")), "nope");
    await cached.ensure();
    expect(diagnostics.latest?.scope).toBe("Loading");
  });

  it("hands the card a retry that refetches", async () => {
    let attempts = 0;
    const cached = new Cached(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("offline")) : Promise.resolve("week");
    }, "nope");
    await cached.ensure();
    await diagnostics.latest?.retry?.();
    expect(cached.value).toBe("week");
    expect(cached.error).toBeNull();
  });

  it("tries again on the next mount instead of showing an empty screen forever", async () => {
    const { calls, fetcher } = deferred<string>();
    const cached = new Cached(fetcher, "nope");
    const first = cached.ensure();
    calls[0].reject(new Error("offline"));
    await first;

    const second = cached.ensure();
    expect(fetcher).toHaveBeenCalledTimes(2);
    calls[1].resolve("rows");
    await second;
    expect(cached.value).toBe("rows");
    expect(cached.error).toBeNull();
  });

  it("tries again after a failed check, too", async () => {
    const { calls, fetcher } = deferred<string>();
    const cached = new Cached(fetcher, "nope");
    const first = cached.ensure();
    calls[0].resolve("rows");
    await first;

    cached.invalidate();
    const second = cached.ensure();
    calls[1].reject(new Error("offline"));
    await second;

    const third = cached.ensure();
    expect(fetcher).toHaveBeenCalledTimes(3);
    calls[2].resolve("rows");
    await third;
    expect(cached.error).toBeNull();
  });
});

describe("invalidate", () => {
  it("refetches on the next ensure without blanking the screen", async () => {
    const fetcher = vi.fn(async () => "rows");
    const cached = new Cached(fetcher, "nope");
    await cached.ensure();
    cached.invalidate();
    expect(cached.value).toBe("rows");
    await cached.ensure();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("isn't forgotten by an answer that was already on its way", async () => {
    // The write that invalidated this landed after the read was sent, so the answer coming back
    // describes the world from before the write. Trusting it would leave the screen stale until
    // something else happened to invalidate it again.
    const { calls, fetcher } = deferred<string>();
    const cached = new Cached(fetcher, "nope");
    const first = cached.ensure();
    cached.invalidate();
    calls[0].resolve("before the write");
    await first;

    const second = cached.ensure();
    expect(fetcher).toHaveBeenCalledTimes(2);
    calls[1].resolve("after the write");
    await second;
    expect(cached.value).toBe("after the write");

    // And once it has been checked against the world the write made, it's settled again.
    await cached.ensure();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("the copy on the device", () => {
  it("opens on last session's rows and checks them behind it", async () => {
    persist.write("week:2026-08-10", "from disk", Date.now());
    const fetcher = vi.fn(async () => "from the server");
    const cached = new Cached(fetcher, "nope", "week:2026-08-10");
    // Before anything is awaited: this is what makes the first frame have rows in it.
    expect(cached.value).toBe("from disk");
    expect(cached.hasValue).toBe(true);
    await cached.ensure();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cached.value).toBe("from the server");
    expect(persist.read("week:2026-08-10")).toBe("from the server");
  });

  it("starts empty when the device has nothing, or nothing readable", async () => {
    expect(new Cached(async () => "x", "nope", "week:none").hasValue).toBe(false);
    localStorage.setItem("balance:v2:week:bad", "{{{");
    expect(new Cached(async () => "x", "nope", "week:bad").hasValue).toBe(false);
  });

  it("writes through what a write pushed in, without a request", () => {
    const cached = new Cached(async () => "from the server", "nope", "week:2026-08-10");
    cached.set("pushed in");
    expect(persist.read("week:2026-08-10")).toBe("pushed in");
  });

  it("patch keeps the value worth checking, set says it isn't", async () => {
    const fetcher = vi.fn(async () => "from the server");
    const cached = new Cached(fetcher, "nope");
    await cached.ensure();

    cached.invalidate();
    cached.patch("worked out here");
    await cached.ensure();
    expect(fetcher).toHaveBeenCalledTimes(2);

    cached.invalidate();
    cached.set("the whole thing, from the server");
    await cached.ensure();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clear takes it off the device as well as off the screen", async () => {
    persist.write("week:2026-08-10", "from disk", Date.now());
    const cached = new Cached(async () => "x", "nope", "week:2026-08-10");
    cached.clear();
    expect(cached.value).toBeUndefined();
    expect(cached.hasValue).toBe(false);
    expect(cached.error).toBeNull();
    expect(persist.read("week:2026-08-10")).toBeUndefined();

    const fetcher = vi.fn(async () => "x");
    const other = new Cached(fetcher, "nope");
    await other.ensure();
    other.clear();
    await other.ensure();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
