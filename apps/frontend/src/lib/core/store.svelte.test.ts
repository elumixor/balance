import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent, CalendarWeek } from "$lib/calendar/types";
import { NOT_A_MEETING } from "$lib/calendar/types";

/**
 * The store is the only module that reaches the network, and none of what's tested here is about
 * the network. `synced` brings a whole write queue and a `localStorage` schema with it, which is
 * its own package's problem, not this one's.
 */
const week = vi.fn(async (from: string, to: string): Promise<CalendarWeek> => emptyWeek(from, to));
vi.mock("$lib/calendar/queries", () => ({
  getCalendarWeek: (from: string, to: string) => week(from, to),
  getCalendarPrefs: async () => ({ accounts: [], visibleCalendarIds: [] }),
}));
vi.mock("$lib/integrations/queries", () => ({ getIntegrations: async () => [] }));
vi.mock("$lib/account/queries", () => ({ getPreferences: async () => ({}) }));
vi.mock("$lib/projects/queries", () => ({
  getProjectProgress: (timeZone: string, today: string) => progress(timeZone, today),
}));
const progress = vi.fn(async (_timeZone: string, _today: string) => ({
  connected: true,
  needsReconnect: false,
  weeks: [],
  projects: {},
  practices: {},
}));
const syncedMock = {
  ensure: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
  sync: vi.fn(async () => undefined),
  syncing: false,
};
vi.mock("./synced.svelte", () => ({ synced: syncedMock }));

const {
  adoptUser,
  applyCalendarEvent,
  calendarWeek,
  clearStore,
  dropCalendarEvent,
  invalidate,
  refreshStore,
  store,
  syncing,
  warmStore,
} = await import("./store.svelte");
const persist = await import("./persist");

function emptyWeek(from: string, to: string, events: CalendarEvent[] = []): CalendarWeek {
  return { from, to, connected: true, needsReconnect: false, writeCalendarId: "acc::cal", events };
}

function event(id: string, start: Date, end: Date): CalendarEvent {
  return {
    id,
    calendarId: "acc::cal",
    seriesId: null,
    title: id,
    description: null,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    declined: false,
    tentative: false,
    readOnly: false,
    movable: true,
    countsTowardHours: true,
    url: null,
    mappingScope: null,
    activityId: null,
    activityName: null,
    weights: [],
    ...NOT_A_MEETING,
  };
}

/** Fills a week's cache with the events given, the way a real fetch would. */
async function loadWeek(key: string, events: CalendarEvent[]) {
  const cached = calendarWeek(key);
  week.mockImplementationOnce(async (from, to) => emptyWeek(from, to, events));
  cached.invalidate();
  await cached.refresh();
  return cached;
}

beforeEach(async () => {
  localStorage.clear();
  await clearStore();
  week.mockClear();
  week.mockImplementation(async (from, to) => emptyWeek(from, to));
  syncedMock.ensure.mockClear();
  syncedMock.clear.mockClear();
});

describe("calendarWeek", () => {
  it("hands the same cache back for the same Monday", () => {
    expect(calendarWeek("2026-08-10")).toBe(calendarWeek("2026-08-10"));
    expect(calendarWeek("2026-08-17")).not.toBe(calendarWeek("2026-08-10"));
  });

  it("asks for exactly that week", async () => {
    await calendarWeek("2026-08-10").ensure();
    expect(week).toHaveBeenCalledWith(new Date(2026, 7, 10).toISOString(), new Date(2026, 7, 17).toISOString());
  });

  it("drops the week nobody has come back to, not the one being scrolled over", async () => {
    const held = calendarWeek("2026-08-10");
    await held.ensure();
    for (let i = 0; i < 12; i++) {
      calendarWeek(`2026-08-1${i % 10}`);
      // Touching the held week keeps it the newest, which is what paging back and forth does.
      calendarWeek("2026-08-10");
    }
    expect(calendarWeek("2026-08-10")).toBe(held);
  });

  it("forgets a week paged far away from, and refetches it when it comes back", async () => {
    const first = calendarWeek("2026-01-05");
    await first.ensure();
    for (let i = 0; i < 12; i++) calendarWeek(`2026-06-${String(1 + i).padStart(2, "0")}`);
    const again = calendarWeek("2026-01-05");
    expect(again).not.toBe(first);
    // Made fresh, so it knows nothing — except what the device kept, which is stale by definition
    // and checked behind itself.
    week.mockClear();
    await again.ensure();
    expect(week).toHaveBeenCalledTimes(1);
  });
});

describe("applyCalendarEvent", () => {
  it("puts a write's own answer into the week that holds it, without a refetch", async () => {
    const cached = await loadWeek("2026-08-10", [event("a", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10))]);
    week.mockClear();

    applyCalendarEvent(event("a", new Date(2026, 7, 11, 14), new Date(2026, 7, 11, 15)));
    expect(cached.value?.events.map((e) => e.start)).toEqual([new Date(2026, 7, 11, 14).toISOString()]);
    expect(week).not.toHaveBeenCalled();
  });

  it("adds an event the week didn't have", async () => {
    const cached = await loadWeek("2026-08-10", []);
    applyCalendarEvent(event("new", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10)));
    expect(cached.value?.events.map((e) => e.id)).toEqual(["new"]);
  });

  it("moves an event from the week it left to the week it landed in", async () => {
    const from = await loadWeek("2026-08-10", [event("a", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10))]);
    const to = await loadWeek("2026-08-17", []);

    applyCalendarEvent(event("a", new Date(2026, 7, 18, 9), new Date(2026, 7, 18, 10)));
    expect(from.value?.events).toEqual([]);
    expect(to.value?.events.map((e) => e.id)).toEqual(["a"]);
  });

  it("keeps an event that straddles Sunday night in both weeks", async () => {
    const first = await loadWeek("2026-08-10", []);
    const second = await loadWeek("2026-08-17", []);
    applyCalendarEvent(event("night", new Date(2026, 7, 16, 22), new Date(2026, 7, 17, 2)));
    expect(first.value?.events.map((e) => e.id)).toEqual(["night"]);
    expect(second.value?.events.map((e) => e.id)).toEqual(["night"]);
  });

  it("replaces the draft it was made from rather than drawing both", async () => {
    const cached = await loadWeek("2026-08-10", [
      event("draft:0", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10)),
    ]);
    applyCalendarEvent(event("real", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10)), "draft:0");
    expect(cached.value?.events.map((e) => e.id)).toEqual(["real"]);
  });

  it("takes the draft off a week the answer doesn't belong in", async () => {
    const cached = await loadWeek("2026-08-10", [
      event("draft:0", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10)),
    ]);
    applyCalendarEvent(event("real", new Date(2026, 7, 25, 9), new Date(2026, 7, 25, 10)), "draft:0");
    expect(cached.value?.events).toEqual([]);
  });

  it("leaves a week it has nothing to do with exactly as it was", async () => {
    const other = await loadWeek("2026-09-07", [event("b", new Date(2026, 8, 8, 9), new Date(2026, 8, 8, 10))]);
    const before = other.value;
    applyCalendarEvent(event("a", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10)));
    // The same object, not an equal one: a new array re-places every block in that week's grid.
    expect(other.value).toBe(before);
  });

  it("has nothing to do for a week whose rows haven't arrived yet", () => {
    const cached = calendarWeek("2026-08-10");
    applyCalendarEvent(event("a", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10)));
    expect(cached.hasValue).toBe(false);
  });

  it("leaves the week still worth checking, so a write doesn't pass for a read", async () => {
    const cached = await loadWeek("2026-08-10", []);
    cached.invalidate();
    applyCalendarEvent(event("a", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10)));
    week.mockClear();
    await cached.ensure();
    expect(week).toHaveBeenCalledTimes(1);
  });

  it("survives on the device, so the next cold start opens on it", async () => {
    await loadWeek("2026-08-10", []);
    applyCalendarEvent(event("a", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10)));
    expect(persist.read<CalendarWeek>("week:2026-08-10")?.events.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("dropCalendarEvent", () => {
  it("takes the row out of every week that had it", async () => {
    const first = await loadWeek("2026-08-10", [event("night", new Date(2026, 7, 16, 22), new Date(2026, 7, 17, 2))]);
    const second = await loadWeek("2026-08-17", [event("night", new Date(2026, 7, 16, 22), new Date(2026, 7, 17, 2))]);
    dropCalendarEvent("night");
    expect(first.value?.events).toEqual([]);
    expect(second.value?.events).toEqual([]);
  });

  it("leaves weeks that never had it untouched", async () => {
    const cached = await loadWeek("2026-08-10", [event("a", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10))]);
    const before = cached.value;
    dropCalendarEvent("somebody else's event");
    expect(cached.value).toBe(before);
  });
});

describe("invalidate", () => {
  it("has every week refetch behind its rows, whatever changed", async () => {
    for (const change of [invalidate.categories, invalidate.activities, invalidate.calendar]) {
      const cached = await loadWeek("2026-08-10", []);
      week.mockClear();
      change();
      await cached.ensure();
      expect(week).toHaveBeenCalledTimes(1);
    }
  });

  it("replaces the connection as well as the weeks when an account is connected", async () => {
    await store.integrations.ensure();
    await store.calendars.ensure();
    const cached = await loadWeek("2026-08-10", []);
    week.mockClear();

    invalidate.integrations();
    await Promise.all([store.integrations.ensure(), store.calendars.ensure(), cached.ensure()]);
    expect(week).toHaveBeenCalledTimes(1);
  });
});

describe("the session's rows", () => {
  it("warms every screen at once, and only once", async () => {
    await warmStore();
    await warmStore();
    expect(syncedMock.ensure).toHaveBeenCalledTimes(2);
    expect(store.integrations.hasValue && store.preferences.hasValue).toBe(true);
    expect(week).toHaveBeenCalledTimes(1);
  });

  it("asks for the projects' evidence as the device's own day, in its own zone", async () => {
    progress.mockClear();
    await store.progress.refresh();
    const [timeZone, today] = progress.mock.calls[0];
    expect(timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // A tag on an event moves a card's hours, so the calendar's writes mark it stale too.
    invalidate.calendar();
    await store.progress.ensure();
    invalidate.projects();
    await store.progress.ensure();
    expect(progress).toHaveBeenCalledTimes(3);
  });

  it("says the projects tab is checking while its evidence is being read", async () => {
    await store.progress.ensure();
    expect(syncing.projects).toBe(false);
    let release: (() => void) | undefined;
    progress.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ connected: true, needsReconnect: false, weeks: [], projects: {}, practices: {} });
        }),
    );
    const out = store.progress.refresh();
    expect(syncing.projects).toBe(true);
    release?.();
    await out;
    expect(syncing.projects).toBe(false);
  });

  it("says a week is being checked only behind rows already on screen", async () => {
    const cached = await loadWeek("2026-08-10", []);
    expect(syncing.calendar).toBe(false);
    expect(syncing.planning).toBe(false);
    let release: (() => void) | undefined;
    week.mockImplementationOnce(
      (from, to) =>
        new Promise((resolve) => {
          release = () => resolve(emptyWeek(from, to));
        }),
    );
    const out = cached.refresh();
    expect(syncing.calendar).toBe(true);
    release?.();
    await out;
    expect(syncing.calendar).toBe(false);
  });

  it("signing out takes the rows off the screen and off the device", async () => {
    await warmStore();
    await loadWeek("2026-08-10", [event("a", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10))]);
    await clearStore();
    expect(store.integrations.hasValue).toBe(false);
    expect(calendarWeek("2026-08-10").hasValue).toBe(false);
    expect(persist.read("week:2026-08-10")).toBeUndefined();
    expect(syncedMock.clear).toHaveBeenCalled();
  });

  it("a different account than the device held drops what it held", async () => {
    persist.adoptOwner("user_1");
    await loadWeek("2026-08-10", [event("a", new Date(2026, 7, 11, 9), new Date(2026, 7, 11, 10))]);

    adoptUser("user_1");
    expect(persist.read("week:2026-08-10")).toBeDefined();

    adoptUser("user_2");
    // `clearStore` is fired without being awaited — it's a sign-in path, not a render path.
    await vi.waitFor(() => expect(persist.read("week:2026-08-10")).toBeUndefined());
    expect(calendarWeek("2026-08-10").hasValue).toBe(false);
  });

  it("a refresh asks the server for every row again, weeks on screen included", async () => {
    await warmStore();
    await loadWeek("2026-08-10", []);
    week.mockClear();
    progress.mockClear();
    await refreshStore();
    expect(syncedMock.sync).toHaveBeenCalled();
    expect(progress).toHaveBeenCalledTimes(1);
    expect(week).toHaveBeenCalled();
  });

  it("a calendar refresh now refetches only the weeks that are already on screen", async () => {
    await loadWeek("2026-08-10", []);
    calendarWeek("2026-08-17");
    week.mockClear();
    await invalidate.calendarNow();
    expect(week).toHaveBeenCalledTimes(1);
    expect(week.mock.calls[0][0]).toBe(new Date(2026, 7, 10).toISOString());
  });
});
