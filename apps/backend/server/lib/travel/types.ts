export const TRAVEL_MODES = ["transit", "drive", "bicycle", "walk"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export interface TravelLeg {
  readonly mode: TravelMode;
  /** How long the journey takes, door to door. */
  readonly seconds: number;
  readonly meters: number;
  /** Google Maps, opened on this route in whatever the machine treats as a maps link. */
  readonly url: string;
}

export interface TravelAnswer {
  /** False when there was nowhere to leave from — the app then simply doesn't offer travel times. */
  readonly available: boolean;
  readonly legs: TravelLeg[];
}

/** When a journey has to arrive, and the offset of the clock on the wall where it does. */
export interface Arrival {
  readonly at: Date;
  /** Minutes east of UTC — what the maps link needs, since Maps reads "arrive by" as local time. */
  readonly offsetMinutes: number;
}
