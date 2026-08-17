import { browser } from "$app/environment";

/**
 * How you want to be reminded, and how you get around.
 *
 * Kept on the device rather than on the server, because both answers are about this machine: the
 * reminder card only exists in the macOS app, and "where I leave from" is where this computer
 * usually is. They also have to be readable in the first frame — a reminder that has to wait for
 * a round trip before it knows whether it's wanted is a reminder that fires late.
 */

export type TravelMode = "transit" | "drive" | "bicycle" | "walk";

export const TRAVEL_MODES: { value: TravelMode; label: string }[] = [
  { value: "transit", label: "Transit" },
  { value: "drive", label: "Drive" },
  { value: "bicycle", label: "Cycle" },
  { value: "walk", label: "Walk" },
];

interface Stored {
  reminders: {
    enabled: boolean;
    /** Used for events the calendar has no reminder of its own for. */
    leadMinutes: number;
    /** Whether the event's own reminders in Google Calendar are honoured as well. */
    useCalendarReminders: boolean;
    /** A second card when it's time to set off, for events that say where they are. */
    leaveInTime: boolean;
    sound: boolean;
  };
  travel: {
    /** Where you're coming from — an address, or empty for "don't work it out". */
    origin: string;
    /** The ways you'd consider going, in the order you'd consider them. */
    modes: TravelMode[];
    /** Minutes to be there early, added to every journey. */
    bufferMinutes: number;
  };
}

const KEY = "balance.preferences";

const DEFAULTS: Stored = {
  reminders: { enabled: true, leadMinutes: 5, useCalendarReminders: true, leaveInTime: true, sound: true },
  travel: { origin: "", modes: ["transit", "drive"], bufferMinutes: 5 },
};

class Preferences {
  reminders = $state({ ...DEFAULTS.reminders });
  travel = $state({ ...DEFAULTS.travel });

  constructor() {
    if (!browser) return;
    // Read in the constructor, like the caches are: nothing on screen should flash the default
    // and then correct itself.
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Stored> | null;
      if (!stored) return;
      this.reminders = { ...DEFAULTS.reminders, ...stored.reminders };
      this.travel = { ...DEFAULTS.travel, ...stored.travel };
    } catch {
      // A preference written by an older build isn't worth an error on screen.
    }
  }

  setReminders(patch: Partial<Stored["reminders"]>) {
    this.reminders = { ...this.reminders, ...patch };
    this.#save();
  }

  setTravel(patch: Partial<Stored["travel"]>) {
    this.travel = { ...this.travel, ...patch };
    this.#save();
  }

  /** Turns one way of getting there on or off, keeping the order the picker lists them in. */
  toggleMode(mode: TravelMode) {
    const chosen = new Set(this.travel.modes);
    if (chosen.has(mode)) chosen.delete(mode);
    else chosen.add(mode);
    this.setTravel({ modes: TRAVEL_MODES.map((m) => m.value).filter((value) => chosen.has(value)) });
  }

  #save() {
    if (!browser) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ reminders: this.reminders, travel: this.travel } satisfies Stored));
    } catch {
      // Storage full or blocked: the preference still holds for this session.
    }
  }
}

export const preferences = new Preferences();
