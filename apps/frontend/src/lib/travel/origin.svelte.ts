import { preferences } from "$lib/account/preferences.svelte";
import { read, write } from "$lib/core/persist";

/**
 * Where a journey starts.
 *
 * There used to be one answer to that — a single address in settings — which is wrong twice over:
 * the gym is not left from the office, and on a Saturday you are not at either. So an event's
 * journey starts either from a place you have named or from wherever the device is standing, and
 * the choice is remembered per event.
 *
 * Remembered on the device, deliberately. "Where I am now" only means anything on the machine
 * holding the person, and the same is true of the reminder it feeds: the Mac ticks and the phone
 * schedules ahead, each from where it is. Nothing here is worth a round trip.
 */

/** A journey's starting point: somewhere named, or the device's own position. */
export type OriginChoice = { kind: "here" } | { kind: "saved"; id: string };

export const HERE: OriginChoice = { kind: "here" };

const STORE_KEY = "event-origins";

/** How long a fix is treated as still true. A person walks; a phone asked twice a minute doesn't. */
const POSITION_MAX_AGE_MS = 2 * 60_000;
const POSITION_TIMEOUT_MS = 10_000;

/** Coordinates as the Routes API is happy to take them — see `waypoint` on the server. */
function asOrigin(position: GeolocationPosition) {
  return `${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`;
}

class TravelOrigin {
  /** Per event, because one event is somewhere you go from home and the next one isn't. */
  #chosen = $state<Record<string, string>>(read<Record<string, string>>(STORE_KEY) ?? {});

  /** The last fix, kept so opening three events in a row is one trip to the location services. */
  #position = $state<{ at: number; origin: string } | null>(null);
  #asking: Promise<string | null> | null = null;

  /** Whether the device can be asked where it is at all — a Tauri window on a Mac often can't. */
  readonly canUseHere = typeof navigator !== "undefined" && "geolocation" in navigator;

  /**
   * What this event's journey starts from. An event nobody has chosen for uses the account's
   * default place, and falls back to the device when there is no default — which is also the
   * answer for somebody who has never named anywhere.
   */
  choiceFor(eventId: string): OriginChoice {
    const stored = this.#chosen[eventId];
    if (stored === "here") return HERE;
    if (stored && preferences.location(stored)) return { kind: "saved", id: stored };
    const fallback = preferences.travel.defaultLocationId;
    return fallback ? { kind: "saved", id: fallback } : HERE;
  }

  choose(eventId: string, choice: OriginChoice) {
    this.#chosen = { ...this.#chosen, [eventId]: choice.kind === "here" ? "here" : choice.id };
    write(STORE_KEY, this.#chosen, Date.now());
  }

  /** The label a picker shows: the place's name, or where the device is. */
  labelFor(choice: OriginChoice) {
    return choice.kind === "here" ? "Where I am" : (preferences.location(choice.id)?.label ?? "Where I am");
  }

  /**
   * The origin as the server wants it — an address, or a pair of coordinates. Null when there is
   * nothing to go on, which is a normal answer: permission refused, no fix, nowhere named. Every
   * caller already draws no journey in that case.
   */
  async resolve(choice: OriginChoice): Promise<string | null> {
    if (choice.kind === "saved") return preferences.location(choice.id)?.address ?? null;
    return await this.here();
  }

  /** The same, for an event, in one call — what the chips and the reminders actually use. */
  async resolveFor(eventId: string) {
    return await this.resolve(this.choiceFor(eventId));
  }

  /** Where the device is, asked at most once at a time and remembered for a couple of minutes. */
  async here(): Promise<string | null> {
    if (!this.canUseHere) return null;
    const cached = this.#position;
    if (cached && Date.now() - cached.at < POSITION_MAX_AGE_MS) return cached.origin;

    // A second caller while the first is still waiting gets the first one's answer: three event
    // cards opening at once must not be three permission prompts.
    this.#asking ??= new Promise<string | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.#position = { at: Date.now(), origin: asOrigin(position) };
          resolve(this.#position.origin);
        },
        // Refused, unavailable, timed out — all of them mean the same thing here, which is that
        // this journey can't be worked out and nothing about it is drawn.
        () => resolve(null),
        { enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: POSITION_MAX_AGE_MS },
      );
    }).finally(() => {
      this.#asking = null;
    });

    return await this.#asking;
  }
}

export const travelOrigin = new TravelOrigin();
