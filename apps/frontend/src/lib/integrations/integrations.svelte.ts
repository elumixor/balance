import { App } from "@capacitor/app";
import type { Icon } from "lucide-svelte";
import { HeartPulse } from "lucide-svelte";
import { diagnostics } from "$lib/diagnostics.svelte";
import { isIOSApp } from "$lib/mobile/platform";
import { readSetting, writeSetting } from "$lib/persist";
import { syncIntegrationSpans } from "$lib/queries";
import { invalidate } from "$lib/store.svelte";
import { healthKit } from "./health-kit";
import { sleepSessions } from "./sleep-sessions";

/**
 * Things outside the app that know how some hours were spent, and feed them into the calendar.
 *
 * Apple Health is the first. Each integration offers feeds — kinds of span it can report, sleep
 * being Health's one so far — and each feed is switched on separately, told what its hours count
 * as, and where they land. A feed's spans are written as the integration's own events, stamped
 * with its `source`, and a later sync only ever moves those: a night typed in by hand is nobody's
 * to overwrite (see `server/lib/integrations/spans.ts`).
 *
 * All of it lives on this device. Health data is readable only on the phone holding it, so
 * "Apple Health is on" is a fact about this iPhone, not about the account — the Mac app shows the
 * same page and says so. Settings are kept with `persist.readSetting`, which never ages them out.
 */

export interface Span {
  readonly start: Date;
  readonly end: Date;
}

export interface Feed {
  readonly id: string;
  readonly label: string;
  /** One line under the switch, saying what turning it on does. */
  readonly note: string;
  /** What the events are called in the calendar. */
  readonly title: string;
}

export interface Integration {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly icon: typeof Icon;
  /** Whether this device can run it at all. */
  readonly available: boolean;
  /** What the page says instead of the switches when it can't. */
  readonly unavailableNote: string;
  readonly feeds: readonly Feed[];
  /** Whatever asking permission means for it — a system sheet, an OAuth dance. */
  connect(): Promise<void>;
  read(feedId: string, from: Date, to: Date): Promise<Span[]>;
}

export interface FeedSettings {
  enabled: boolean;
  categoryId: string | null;
  /** Qualified calendar id, or null for wherever new events land. */
  calendarId: string | null;
}

export interface FeedStatus {
  syncing: boolean;
  /** When the last sync finished, whatever it found. */
  syncedAt: number | null;
  /** What it wrote, in words the page can show. */
  summary: string | null;
  error: string | null;
}

/** How far back a sync looks. Long enough that a phone left in a drawer catches up. */
const LOOKBACK_MS = 14 * 24 * 60 * 60_000;
/** A launch or a return to the app syncs at most this often; the button always does. */
const SYNC_EVERY_MS = 4 * 60 * 60_000;
const SETTINGS_KEY = "integrations";

const appleHealth: Integration = {
  id: "apple-health",
  name: "Apple Health",
  note: "Nights your watch or phone recorded, written into your calendar as they happened.",
  icon: HeartPulse,
  available: isIOSApp,
  unavailableNote: "Available in Balance for iPhone, where Health data lives.",
  feeds: [
    {
      id: "sleep",
      label: "Sleep",
      note: "Every night since the last sync becomes one block, from falling asleep to waking.",
      title: "Sleep",
    },
  ],
  connect: () => healthKit.authorize(),
  async read(_feedId, from, to) {
    const { samples } = await healthKit.sleepSamples({ from: from.toISOString(), to: to.toISOString() });
    return sleepSessions(
      samples.map((sample) => ({ start: new Date(sample.start), end: new Date(sample.end), stage: sample.stage })),
    );
  },
};

export const INTEGRATIONS: readonly Integration[] = [appleHealth];

export const feedKey = (integrationId: string, feedId: string) => `${integrationId}:${feedId}`;

const DEFAULT_SETTINGS: FeedSettings = { enabled: false, categoryId: null, calendarId: null };
const IDLE: FeedStatus = { syncing: false, syncedAt: null, summary: null, error: null };

class Integrations {
  #settings = $state<Record<string, FeedSettings>>(readSetting(SETTINGS_KEY) ?? {});
  #status = $state<Record<string, FeedStatus>>({});
  #syncedAt = $state<Record<string, number>>(readSetting(`${SETTINGS_KEY}:synced`) ?? {});
  #stop: (() => void) | null = null;

  settings(integrationId: string, feedId: string): FeedSettings {
    return this.#settings[feedKey(integrationId, feedId)] ?? DEFAULT_SETTINGS;
  }

  status(integrationId: string, feedId: string): FeedStatus {
    const key = feedKey(integrationId, feedId);
    return { ...IDLE, ...this.#status[key], syncedAt: this.#syncedAt[key] ?? null };
  }

  /** Whether anything on this device is switched on — what decides if a launch syncs at all. */
  get anyEnabled() {
    return Object.values(this.#settings).some((s) => s.enabled);
  }

  update(integrationId: string, feedId: string, patch: Partial<FeedSettings>) {
    const key = feedKey(integrationId, feedId);
    this.#settings = { ...this.#settings, [key]: { ...this.settings(integrationId, feedId), ...patch } };
    writeSetting(SETTINGS_KEY, this.#settings);
  }

  /**
   * Switching a feed on asks for permission first, and syncs straight away when granted: the
   * page is open, the person is looking, and a switch that does nothing visible looks broken.
   * The category is decided by the page before this is called, so the first sync has one.
   */
  async enable(integration: Integration, feed: Feed, categoryId: string) {
    const key = feedKey(integration.id, feed.id);
    this.update(integration.id, feed.id, { categoryId });
    try {
      await integration.connect();
    } catch (e) {
      this.#setStatus(key, { error: e instanceof Error ? e.message : "Couldn't connect." });
      return;
    }
    this.update(integration.id, feed.id, { enabled: true });
    await this.sync(integration, feed);
  }

  disable(integration: Integration, feed: Feed) {
    this.update(integration.id, feed.id, { enabled: false });
    this.#setStatus(feedKey(integration.id, feed.id), { error: null, summary: null });
  }

  /** Idempotent, and a no-op anywhere the integrations can't run. */
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

  /** Every enabled feed that hasn't synced lately, one after another. */
  async syncDue() {
    const now = Date.now();
    for (const integration of INTEGRATIONS) {
      if (!integration.available) continue;
      for (const feed of integration.feeds) {
        const key = feedKey(integration.id, feed.id);
        if (!this.settings(integration.id, feed.id).enabled) continue;
        if (now - (this.#syncedAt[key] ?? 0) < SYNC_EVERY_MS) continue;
        await this.sync(integration, feed);
      }
    }
  }

  /**
   * One feed, now. Reads on the device, writes through the server, which owns the matching
   * against what earlier syncs wrote. The category is what makes the events the integration's —
   * the stamp lives on the mapping — so a feed with none yet has to be told first.
   */
  async sync(integration: Integration, feed: Feed) {
    const key = feedKey(integration.id, feed.id);
    if (this.#status[key]?.syncing) return;
    const settings = this.settings(integration.id, feed.id);
    if (!settings.categoryId) {
      this.#setStatus(key, { error: `Choose what ${feed.label.toLowerCase()} counts as first.` });
      return;
    }
    this.#setStatus(key, { syncing: true, error: null });

    try {
      const to = new Date();
      const from = new Date(to.getTime() - LOOKBACK_MS);
      const spans = await integration.read(feed.id, from, to);
      const { result } = await syncIntegrationSpans({
        source: key,
        from: from.toISOString(),
        to: to.toISOString(),
        spans: spans.map((span) => ({ start: span.start.toISOString(), end: span.end.toISOString() })),
        title: feed.title,
        categoryId: settings.categoryId,
        calendarId: settings.calendarId ?? undefined,
      });
      this.#syncedAt = { ...this.#syncedAt, [key]: Date.now() };
      writeSetting(`${SETTINGS_KEY}:synced`, this.#syncedAt);
      this.#setStatus(key, { syncing: false, summary: summarize(spans.length, result) });
      if (result.created + result.updated > 0) invalidate.calendar();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't sync.";
      this.#setStatus(key, { syncing: false, error: message });
      diagnostics.report(integration.name, e);
    }
  }

  #setStatus(key: string, patch: Partial<FeedStatus>) {
    this.#status = { ...this.#status, [key]: { ...IDLE, ...this.#status[key], ...patch } };
  }
}

function summarize(found: number, result: { created: number; updated: number }): string {
  if (found === 0) return "Nothing recorded in the last two weeks.";
  const parts = [];
  if (result.created) parts.push(`${result.created} added`);
  if (result.updated) parts.push(`${result.updated} moved`);
  return parts.length ? `${found} found, ${parts.join(", ")}.` : `${found} found, all already in your calendar.`;
}

export const integrations = new Integrations();
