/** What the account keeps about how you want to be reminded and how you get around. */

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
  /** The glyph it wears in pickers, a Lucide name from `$lib/icons`; absent, it wears a pin. */
  icon?: string;
  /** Google's id for it and where it is, kept when a suggestion was chosen so the map is free. */
  placeId?: string | null;
  latitude?: number;
  longitude?: number;
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

/**
 * A zone worth naming — "Kyiv", "Prague" — so an event can be put in it by the name the person
 * uses. The IANA name is what the calendar is actually told.
 */
export interface SavedZone {
  id: string;
  label: string;
  zone: string;
}

export interface ZonesPrefs {
  saved: SavedZone[];
  /** The hours' columns beside the week grid, as IANA names. Empty means the device's own zone. */
  columns: string[];
}

/** Which of an event card's sections are folded away, by the section's id. */
export interface CardPrefs {
  hidden: string[];
}

/** When each integration feed was last read, by feed key, as ISO instants — written by the device that read it. */
export interface IntegrationsPrefs {
  synced: Record<string, string>;
}

/** What each connected calendar account is called here, by its id — "Work", "Personal". */
export interface AccountsPrefs {
  aliases: Record<string, string>;
}

export interface StoredPreferences {
  reminders: RemindersPrefs;
  travel: TravelPrefs;
  sessions: SessionsPrefs;
  zones: ZonesPrefs;
  card: CardPrefs;
  integrations: IntegrationsPrefs;
  accounts: AccountsPrefs;
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
  zones: { saved: [], columns: [] },
  card: { hidden: [] },
  integrations: { synced: {} },
  accounts: { aliases: {} },
};
