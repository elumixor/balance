import { App } from "@capacitor/app";
import type { Icon } from "lucide-svelte";
import { HeartPulse } from "lucide-svelte";
import type { Component } from "svelte";
import { diagnostics } from "$lib/diagnostics.svelte";
import { isIOSApp } from "$lib/mobile/platform";
import { readSetting, writeSetting } from "$lib/persist";
import { preferences } from "$lib/preferences.svelte";
import { getCalendarWeek, saveIntegrationRecords, updateCalendarEvent } from "$lib/queries";
import { invalidate } from "$lib/store.svelte";
import type { CalendarEvent } from "$lib/types";
import { healthKit } from "./health-kit";
import SleepSection from "./SleepSection.svelte";
import { sleepScore } from "./sleep-score";
import { asSleepPlan, asSleepSummary, sleepSummary } from "./sleep-summary";

/**
 * Things outside the app that know how some hours actually went, hung off the events that
 * planned them.
 *
 * An integration offers feeds — Apple Health's one so far is sleep. A feed is linked to an
 * event from the event's own card: the "Sleep" block that repeats every night is told that Apple
 * Health knows what happened under it. From then on the device that can read the feed (only an
 * iPhone can read Health) looks up each past occurrence, works out the feed's record for it, and
 * writes it to the server; every screen then draws the feed's own section on the card, under the
 * block, from that record. Where the feed knows when the thing actually happened, the occurrence
 * is moved to it: the calendar ends up holding the night as it was slept, not as it was planned.
 *
 * The link is on the mapping (`source`), so it survives the way a category does; what this device
 * keeps for itself is only whether the person has let it read each integration.
 */

export interface RecordWindow {
  readonly start: Date;
  readonly end: Date;
}

export interface Feed {
  readonly id: string;
  readonly label: string;
  /** What linking does, in one line under the name. */
  readonly note: string;
  /**
   * Reads the feed for one occurrence's window. Null when it saw nothing. The record it wrote
   * last time is handed back, for whatever it has to carry forward — the block's planned time
   * survives there once the block has been moved to the night.
   */
  record(window: RecordWindow, previous: Record<string, unknown> | null): Promise<Record<string, unknown> | null>;
  /** When the record says the thing really happened, for the occurrence to be moved to. */
  actual?(record: Record<string, unknown>): RecordWindow | null;
  /** The section the event card draws for a linked event. */
  readonly section: Component<{ event: CalendarEvent }>;
}

export interface Integration {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly icon: typeof Icon;
  /** Whether this device can read it at all. */
  readonly available: boolean;
  /** What the buttons say instead when it can't. */
  readonly unavailableNote: string;
  readonly feeds: readonly Feed[];
  /** Whatever asking permission means for it — a system sheet, an OAuth dance. */
  connect(): Promise<void>;
}

export interface FeedStatus {
  syncing: boolean;
  syncedAt: number | null;
  error: string | null;
}

/** How far back a sync looks. Long enough that a phone left in a drawer catches up. */
const LOOKBACK_MS = 14 * 24 * 60 * 60_000;
/** A launch or a return to the app syncs at most this often; the button always does. */
const SYNC_EVERY_MS = 4 * 60 * 60_000;
/** Reading Health is per occurrence, so the number of round trips is bounded here. */
const MAX_OCCURRENCES = 60;
const SETTINGS_KEY = "integrations";

const appleHealth: Integration = {
  id: "apple-health",
  name: "Apple Health",
  note: "What your watch or phone recorded, shown under the blocks that planned it.",
  icon: HeartPulse,
  available: isIOSApp,
  unavailableNote: "Read by Balance for iPhone, where Health data lives. Link here; the record arrives from there.",
  feeds: [
    {
      id: "sleep",
      label: "Sleep",
      note: "The night Health recorded: how long, when, and how deep.",
      async record(window, previous) {
        const from = new Date(window.start.getTime() - 4 * 60 * 60_000);
        const to = new Date(window.end.getTime() + 4 * 60 * 60_000);
        const { samples } = await healthKit.sleepSamples({ from: from.toISOString(), to: to.toISOString() });
        const summary = sleepSummary(
          samples.map((s) => ({ start: new Date(s.start), end: new Date(s.end), stage: s.stage })),
          window,
        );
        if (!summary) return null;
        const planned = asSleepPlan(previous) ?? {
          plannedStart: window.start.toISOString(),
          plannedEnd: window.end.toISOString(),
        };
        return { ...summary, ...planned, score: sleepScore(summary, new Date(planned.plannedStart)) };
      },
      actual(record) {
        const summary = asSleepSummary(record);
        return summary ? { start: new Date(summary.start), end: new Date(summary.end) } : null;
      },
      section: SleepSection,
    },
  ],
  connect: () => healthKit.authorize(),
};

export const INTEGRATIONS: readonly Integration[] = [appleHealth];

export const feedKey = (integrationId: string, feedId: string) => `${integrationId}:${feedId}`;

/** Every feed there is, keyed the way an event's `source` names it. */
export const FEEDS: ReadonlyMap<string, { integration: Integration; feed: Feed }> = new Map(
  INTEGRATIONS.flatMap((integration) =>
    integration.feeds.map((feed) => [feedKey(integration.id, feed.id), { integration, feed }] as const),
  ),
);

const IDLE: FeedStatus = { syncing: false, syncedAt: null, error: null };

/** A block is left alone once it is within a minute of the record, so a sync that moved it stops there. */
const differs = (actual: RecordWindow, event: CalendarEvent) =>
  Math.abs(actual.start.getTime() - new Date(event.start).getTime()) >= 60_000 ||
  Math.abs(actual.end.getTime() - new Date(event.end).getTime()) >= 60_000;

class Integrations {
  /** Which integrations this device has been let read. */
  #connected = $state<Record<string, boolean>>(readSetting(SETTINGS_KEY) ?? {});
  #status = $state<Record<string, FeedStatus>>({});
  #syncedAt = $state<Record<string, number>>(readSetting(`${SETTINGS_KEY}:synced`) ?? {});
  #stop: (() => void) | null = null;

  connected(integrationId: string) {
    return this.#connected[integrationId] === true;
  }

  status(integrationId: string, feedId: string): FeedStatus {
    const key = feedKey(integrationId, feedId);
    return { ...IDLE, ...this.#status[key], syncedAt: this.#syncedAt[key] ?? null };
  }

  /** Puts up whatever the integration asks with, and remembers that it was answered. */
  async connect(integration: Integration): Promise<boolean> {
    try {
      await integration.connect();
    } catch (e) {
      diagnostics.report(integration.name, e);
      return false;
    }
    this.#connected = { ...this.#connected, [integration.id]: true };
    writeSetting(SETTINGS_KEY, this.#connected);
    return true;
  }

  /** Forgets the answer here; the system's own permission is the person's to revoke in Settings. */
  disconnect(integration: Integration) {
    this.#connected = { ...this.#connected, [integration.id]: false };
    writeSetting(SETTINGS_KEY, this.#connected);
  }

  /** Idempotent, and a no-op anywhere no integration can run. */
  start() {
    if (this.#stop || !INTEGRATIONS.some((i) => i.available)) return;
    void this.syncDue();
    let remove: (() => Promise<void>) | null = null;
    void App.addListener("resume", () => void this.syncDue()).then((handle) => {
      remove = () => handle.remove();
    });
    this.#stop = () => void remove?.();
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
  }

  /** Every readable feed that hasn't synced lately, one after another. */
  async syncDue() {
    const now = Date.now();
    for (const integration of INTEGRATIONS) {
      if (!integration.available || !this.connected(integration.id)) continue;
      for (const feed of integration.feeds) {
        if (now - (this.#syncedAt[feedKey(integration.id, feed.id)] ?? 0) < SYNC_EVERY_MS) continue;
        await this.sync(integration, feed);
      }
    }
  }

  /**
   * One feed, now: every past occurrence linked to it in the last two weeks is looked up and its
   * record written. Occurrences the feed saw nothing for are skipped rather than written empty —
   * a watch that synced late fills them in next time. An occurrence the feed dates differently is
   * moved to when it actually happened, once: the next sync finds the block where the record is.
   */
  async sync(integration: Integration, feed: Feed) {
    const key = feedKey(integration.id, feed.id);
    if (this.#status[key]?.syncing || !integration.available) return;
    if (!this.connected(integration.id) && !(await this.connect(integration))) return;
    this.#setStatus(key, { syncing: true, error: null });

    try {
      const now = new Date();
      const from = new Date(now.getTime() - LOOKBACK_MS);
      const { events } = await getCalendarWeek(from.toISOString(), now.toISOString());
      const linked = events
        .filter((event) => event.source === key && new Date(event.end) <= now)
        .slice(-MAX_OCCURRENCES);

      const records = [];
      let moved = false;
      for (const event of linked) {
        const data = await feed.record({ start: new Date(event.start), end: new Date(event.end) }, event.record);
        if (!data) continue;
        records.push({ calendarId: event.calendarId, externalEventId: event.id, data });
        const actual = feed.actual?.(data);
        if (actual && event.movable && differs(actual, event)) {
          await updateCalendarEvent(event.id, {
            calendarId: event.calendarId,
            start: actual.start.toISOString(),
            end: actual.end.toISOString(),
          });
          moved = true;
        }
      }
      if (records.length > 0) await saveIntegrationRecords({ source: key, records });
      if (records.length > 0 || moved) await invalidate.calendarNow();
      this.#syncedAt = { ...this.#syncedAt, [key]: Date.now() };
      writeSetting(`${SETTINGS_KEY}:synced`, this.#syncedAt);
      // Said on the account too, so a Mac that can never read Health knows the phone does.
      preferences.markFeedSynced(key, new Date());
      this.#setStatus(key, { syncing: false });
    } catch (e) {
      this.#setStatus(key, { syncing: false, error: e instanceof Error ? e.message : "Couldn't sync." });
      diagnostics.report(integration.name, e);
    }
  }

  #setStatus(key: string, patch: Partial<FeedStatus>) {
    this.#status = { ...this.#status, [key]: { ...IDLE, ...this.#status[key], ...patch } };
  }
}

export const integrations = new Integrations();
