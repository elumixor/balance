import { flushSync } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The screen asks for a session from an `$effect`, and everything the ask looks at is something
 * the answer writes. That combination is what took the whole app down: a failed load cleared the
 * error the effect had read, the effect ran again, and Svelte gave up on every effect there was.
 */
const summary = vi.fn(async (slot: string) => ({ slot, target: { planned: false } }));
vi.mock("$lib/planning/queries", () => ({ getSessionSummary: (slot: string) => summary(slot) }));

const { sessionData } = await import("./session-data.svelte");

beforeEach(() => {
  summary.mockReset();
  summary.mockImplementation(async (slot: string) => ({ slot, target: { planned: false } }) as never);
  sessionData.summary = null;
  sessionData.error = null;
});

describe("sessionData", () => {
  it("asks once for a slot it already holds", async () => {
    await sessionData.enter("evening");
    await sessionData.enter("evening");
    expect(summary).toHaveBeenCalledTimes(1);
  });

  it("doesn't re-run the effect that asked, however the ask went", async () => {
    summary.mockRejectedValue(new Error("nope"));
    let runs = 0;
    const stop = $effect.root(() => {
      $effect(() => {
        runs += 1;
        void sessionData.enter("evening");
      });
    });
    flushSync();
    await Promise.resolve();
    await Promise.resolve();
    flushSync();
    stop();

    expect(sessionData.error).toBe("nope");
    // One run, one request: the failure is on screen rather than being asked for again forever.
    expect(runs).toBe(1);
    expect(summary).toHaveBeenCalledTimes(1);
  });

  it("re-asks on refresh, which is what a commit and a new day both need", async () => {
    await sessionData.enter("morning");
    await sessionData.refresh();
    expect(summary).toHaveBeenCalledTimes(2);
    expect(summary).toHaveBeenLastCalledWith("morning");
  });
});
