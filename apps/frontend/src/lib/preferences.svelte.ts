import { updatePreferences } from "./queries";
import { store } from "./store.svelte";

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

export type TravelMode = "transit" | "drive" | "bicycle" | "walk";

export const TRAVEL_MODES: { value: TravelMode; label: string }[] = [
  { value: "transit", label: "Transit" },
  { value: "drive", label: "Drive" },
  { value: "bicycle", label: "Cycle" },
  { value: "walk", label: "Walk" },
];

export interface RemindersPrefs {
  enabled: boolean;
  /** Used for events the calendar carries no reminder of its own for. */
  leadMinutes: number;
  /** Whether the event's own reminders in the calendar are honoured as well. */
  useCalendarReminders: boolean;
  /** A second card when it's time to set off, for events that say where they are. */
  leaveInTime: boolean;
  sound: boolean;
}

/**
 * A place worth naming — home, the office, the studio.
 *
 * Named rather than typed each time because "when do I have to leave" is asked of a phone in a
 * pocket. The address is whatever Google Maps answered when it was picked, so it is one the
 * Routes API can actually route from.
 */
export interface SavedLocation {
  id: string;
  /** What you call it: "Home", "Office". */
  label: string;
  address: string;
}

export interface TravelPrefs {
  /** The places worth naming. Empty means journeys start from wherever the device is. */
  locations: SavedLocation[];
  /** Which one a journey starts from unless an event says otherwise; null is "where I am now". */
  defaultLocationId: string | null;
  /** The ways you'd consider going, in the order you'd consider them. */
  modes: TravelMode[];
  /** Minutes to be there early, added to every journey. */
  bufferMinutes: number;
}

/**
 * When the app asks you to look back and to plan, and what counts as having planned.
 *
 * The times are the user's own — some people plan tonight, some over coffee — and the zone is
 * written by the app rather than chosen, because a planning day is a day in a place.
 */
export interface SessionsPrefs {
  enabled: boolean;
  eveningTime: string;
  morningTime: string;
  /** 1 is Monday, 7 is Sunday. The weekly sitting replaces that evening's reminder. */
  weeklyWeekday: number;
  weeklyTime: string;
  /** Which sitting you mean to plan in. The other one only looks back. */
  planWhen: "evening" | "morning";
  timeZone: string;
}

export interface StoredPreferences {
  reminders: RemindersPrefs;
  travel: TravelPrefs;
  sessions: SessionsPrefs;
  /** False when the server has no maps key, so the panel can say why journeys aren't on offer. */
  travelAvailable: boolean;
}

/** The same answer the server would give an account that has never set anything. */
export const DEFAULT_PREFERENCES: StoredPreferences = {
  reminders: { enabled: true, leadMinutes: 5, useCalendarReminders: true, leaveInTime: true, sound: true },
  travel: { locations: [], defaultLocationId: null, modes: ["transit", "drive"], bufferMinutes: 5 },
  sessions: {
    enabled: true,
    eveningTime: "18:00",
    morningTime: "08:00",
    weeklyWeekday: 7,
    weeklyTime: "18:00",
    planWhen: "evening",
    timeZone: "UTC",
  },
  travelAvailable: false,
};

/** Long enough that typing an address is one write, short enough to feel immediate. */
const SAVE_DELAY_MS = 500;

class Preferences {
  #pending: {
    reminders?: Partial<RemindersPrefs>;
    travel?: Partial<TravelPrefs>;
    sessions?: Partial<SessionsPrefs>;
  } = {};
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

  /** Whether the server can work out journeys at all — see `GOOGLE_MAPS_API_KEY`. */
  get travelAvailable() {
    return this.#value.travelAvailable;
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
  addLocation(input: { label: string; address: string }): string {
    const id = crypto.randomUUID();
    const locations = [...this.travel.locations, { id, label: input.label.trim(), address: input.address.trim() }];
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
    const patch = this.#pending;
    this.#pending = {};
    if (!patch.reminders && !patch.travel && !patch.sessions) return;
    void updatePreferences(patch).catch(() => {
      // The value on screen is what the user chose; the next write, or the next load, settles it.
      store.preferences.invalidate();
    });
  }

  /**
   * On screen immediately, on the server a moment later. The patches are merged rather than
   * queued, so holding down a stepper is one request.
   */
  #apply(patch: {
    reminders?: Partial<RemindersPrefs>;
    travel?: Partial<TravelPrefs>;
    sessions?: Partial<SessionsPrefs>;
  }) {
    const current = this.#value;
    store.preferences.set({
      ...current,
      reminders: { ...current.reminders, ...patch.reminders },
      travel: { ...current.travel, ...patch.travel },
      sessions: { ...current.sessions, ...patch.sessions },
    });

    this.#pending = {
      reminders: { ...this.#pending.reminders, ...patch.reminders },
      travel: { ...this.#pending.travel, ...patch.travel },
      sessions: { ...this.#pending.sessions, ...patch.sessions },
    };
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }
}

export const preferences = new Preferences();
