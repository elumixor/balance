import { newId } from "$lib/core/ids";
import { store } from "$lib/core/store.svelte";
import { deviceTimeZone } from "$lib/planning/zone";
import {
  type CardPrefs,
  DEFAULT_PREFERENCES,
  type IntegrationsPrefs,
  type RemindersPrefs,
  type SavedLocation,
  type SavedZone,
  type SessionsPrefs,
  type StoredPreferences,
  TRAVEL_MODES,
  type TravelMode,
  type TravelPrefs,
  type ZonesPrefs,
} from "./preferences-types";
import { updatePreferences } from "./queries";

/**
 * How you want to be reminded, and how you get around.
 *
 * Kept on the account rather than on the device. Only the macOS app can act on most of it — a
 * browser tab has nowhere to put a reminder card, and a phone isn't the machine that will tell you
 * to leave — but the settings panel shows the same rows everywhere, so setting them on whichever
 * screen you have open has to reach the machine that uses them.
 *
 * Reads go through the store's cache like every other screen's data, which means the last known
 * answer is on screen in the first frame and the server's is checked behind it. Writes are
 * optimistic for the same reason: a switch that waits for a round trip before it moves feels
 * broken.
 */

/** Long enough that typing an address is one write, short enough to feel immediate. */
const SAVE_DELAY_MS = 500;

interface PreferencesPatch {
  reminders?: Partial<RemindersPrefs>;
  travel?: Partial<TravelPrefs>;
  sessions?: Partial<SessionsPrefs>;
  zones?: Partial<ZonesPrefs>;
  card?: Partial<CardPrefs>;
  integrations?: Partial<IntegrationsPrefs>;
}

class Preferences {
  #pending: PreferencesPatch = {};
  #timer: ReturnType<typeof setTimeout> | null = null;

  get #value(): StoredPreferences {
    return store.preferences.value ?? DEFAULT_PREFERENCES;
  }

  get reminders(): RemindersPrefs {
    return this.#value.reminders;
  }

  get travel(): TravelPrefs {
    return this.#value.travel;
  }

  get sessions(): SessionsPrefs {
    return this.#value.sessions;
  }

  get zones(): SavedZone[] {
    return this.#value.zones.saved;
  }

  /** The zones the week grid names its hours in, the device's own until one is chosen. */
  get zoneColumns(): string[] {
    const columns = this.#value.zones.columns;
    return columns.length > 0 ? columns : [deviceTimeZone()];
  }

  setZoneColumns(columns: string[]) {
    this.#apply({ zones: { columns } });
  }

  /** The sections of an event card folded away. */
  get hiddenSections(): string[] {
    return this.#value.card.hidden;
  }

  setReminders(patch: Partial<RemindersPrefs>) {
    this.#apply({ reminders: patch });
  }

  setTravel(patch: Partial<TravelPrefs>) {
    this.#apply({ travel: patch });
  }

  setSessions(patch: Partial<SessionsPrefs>) {
    this.#apply({ sessions: patch });
  }

  /** The saved zone that names this IANA zone, if one does. */
  zoneNamed(zone: string | null): SavedZone | null {
    return this.zones.find((one) => one.zone === zone) ?? null;
  }

  /** Adds a named zone and hands back its id, so the picker that added it can select it. */
  addZone(input: { label: string; zone: string }): string {
    const id = newId();
    this.#apply({ zones: { saved: [...this.zones, { id, label: input.label.trim(), zone: input.zone }] } });
    return id;
  }

  updateZone(id: string, patch: Partial<Omit<SavedZone, "id">>) {
    this.#apply({ zones: { saved: this.zones.map((one) => (one.id === id ? { ...one, ...patch } : one)) } });
  }

  removeZone(id: string) {
    this.#apply({ zones: { saved: this.zones.filter((one) => one.id !== id) } });
  }

  /** When a feed was last read, on whichever device could — null if no device ever has. */
  feedSyncedAt(feedKey: string): Date | null {
    const at = this.#value.integrations.synced[feedKey];
    return at ? new Date(at) : null;
  }

  /** The device that just read a feed says so, for every other device to see. */
  markFeedSynced(feedKey: string, at: Date) {
    this.#apply({ integrations: { synced: { ...this.#value.integrations.synced, [feedKey]: at.toISOString() } } });
  }

  /** Folds one card section away, or brings it back. */
  toggleSection(section: string, shown: boolean) {
    const hidden = new Set(this.hiddenSections);
    if (shown) hidden.delete(section);
    else hidden.add(section);
    this.#apply({ card: { hidden: [...hidden] } });
  }

  /** The place a journey starts from when nothing has said otherwise, or null for "where I am". */
  get defaultLocation(): SavedLocation | null {
    const id = this.travel.defaultLocationId;
    return this.travel.locations.find((one) => one.id === id) ?? null;
  }

  location(id: string | null): SavedLocation | null {
    return this.travel.locations.find((one) => one.id === id) ?? null;
  }

  /**
   * Adds a place and hands back its id, so the picker that added it can select it in the same
   * gesture. The first place saved becomes the default — somebody who has named exactly one
   * address meant that one.
   */
  addLocation(input: Omit<SavedLocation, "id">): string {
    const id = newId();
    const locations = [
      ...this.travel.locations,
      { ...input, id, label: input.label.trim(), address: input.address.trim() },
    ];
    this.setTravel({
      locations,
      defaultLocationId: this.travel.defaultLocationId ?? id,
    });
    return id;
  }

  updateLocation(id: string, patch: Partial<Omit<SavedLocation, "id">>) {
    this.setTravel({
      locations: this.travel.locations.map((one) => (one.id === id ? { ...one, ...patch } : one)),
    });
  }

  removeLocation(id: string) {
    const locations = this.travel.locations.filter((one) => one.id !== id);
    this.setTravel({
      locations,
      // A default pointing at a place that is gone is the same as no default at all.
      defaultLocationId: this.travel.defaultLocationId === id ? null : this.travel.defaultLocationId,
    });
  }

  /** Turns one way of getting there on or off, keeping the order the picker lists them in. */
  toggleMode(mode: TravelMode) {
    const chosen = new Set(this.travel.modes);
    if (chosen.has(mode)) chosen.delete(mode);
    else chosen.add(mode);
    this.setTravel({ modes: TRAVEL_MODES.map((m) => m.value).filter((value) => chosen.has(value)) });
  }

  /** Writes whatever is queued right now — for a panel being closed mid-sentence. */
  flush() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const patch = Object.fromEntries(
      Object.entries(this.#pending).filter(([, section]) => Object.keys(section).length > 0),
    );
    this.#pending = {};
    if (Object.keys(patch).length === 0) return;
    void updatePreferences(patch).catch(() => {
      // The value on screen is what the user chose; the next write, or the next load, settles it.
      store.preferences.invalidate();
    });
  }

  /**
   * On screen immediately, on the server a moment later. The patches are merged rather than
   * queued, so holding down a stepper is one request.
   */
  #apply(patch: PreferencesPatch) {
    const current = this.#value;
    store.preferences.set({
      ...current,
      reminders: { ...current.reminders, ...patch.reminders },
      travel: { ...current.travel, ...patch.travel },
      sessions: { ...current.sessions, ...patch.sessions },
      zones: { ...current.zones, ...patch.zones },
      card: { ...current.card, ...patch.card },
      integrations: { synced: { ...current.integrations.synced, ...patch.integrations?.synced } },
    });

    this.#pending = {
      reminders: { ...this.#pending.reminders, ...patch.reminders },
      travel: { ...this.#pending.travel, ...patch.travel },
      sessions: { ...this.#pending.sessions, ...patch.sessions },
      zones: { ...this.#pending.zones, ...patch.zones },
      card: { ...this.#pending.card, ...patch.card },
      integrations: { synced: { ...this.#pending.integrations?.synced, ...patch.integrations?.synced } },
    };
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }
}

export const preferences = new Preferences();
