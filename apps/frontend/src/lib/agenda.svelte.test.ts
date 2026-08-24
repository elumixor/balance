import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type { CalendarWeek } from "./types";

/**
 * The agenda reaches the calendar through the store, and the store reaches the network. None of
 * what's tested here is about either — only about what asking for a week does to whoever asked.
 */
vi.mock("./queries", () => ({
  getCalendarWeek: async (from: string, to: string): Promise<CalendarWeek> => ({
    from,
    to,
    connected: true,
    needsReconnect: false,
    writeCalendarId: "acc::cal",
    events: [],
  }),
  getIntegrations: async () => [],
  getCalendarPrefs: async () => ({ accounts: [], visibleCalendarIds: [] }),
  getPreferences: async () => ({}),
}));
vi.mock("./synced.svelte", () => ({
  synced: { ensure: vi.fn(async () => undefined), syncing: false },
  categories: { all: [] },
}));

const { agenda } = await import("./agenda.svelte");

describe("agenda", () => {
  /**
   * The bug this exists for: `tick()` is called from an `$effect` on the phone, and asking the
   * store for a week writes the week map as well as reading it. That is an effect that invalidates
   * itself, and Svelte answers a few thousand of those by tearing down every effect in the app —
   * which on iOS looked like a tab bar that had stopped answering, with nothing on screen to say
   * why. A tick has to be safe to take inside a reaction.
   */
  it("can be ticked from an effect without the effect re-running itself", () => {
    let runs = 0;
    let ticks = 0;
    const dispose = $effect.root(() => {
      $effect(() => {
        runs += 1;
        agenda.tick();
        ticks += 1;
      });
    });

    flushSync();
    expect(runs).toBe(1);
    expect(ticks).toBe(1);
    dispose();
  });
});
