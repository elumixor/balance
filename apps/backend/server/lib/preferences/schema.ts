import { z } from "zod";
import { TRAVEL_MODES } from "~/lib/travel";

/** The shapes of the app's own preferences — what a row holds and what a patch may name. */

export const remindersSchema = z.object({
  enabled: z.boolean(),
  /** Used for events the calendar carries no reminder of its own for. */
  leadMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  useCalendarReminders: z.boolean(),
  /** A second card when it's time to set off, for events that say where they are. */
  leaveInTime: z.boolean(),
  sound: z.boolean(),
});

/**
 * A place the user leaves from often enough to name — home, the office, the studio.
 *
 * Named rather than typed each time because "when do I have to leave" is asked of a phone in a
 * pocket, and an address is a sentence. The id is made by the client so a location can be added
 * from the picker that is about to use it.
 */
const locationSchema = z.object({
  id: z.string().min(1).max(64),
  /** What the user calls it: "Home", "Office". */
  label: z.string().min(1).max(60),
  /** The address as Google Maps knows it — what the Routes API is actually asked about. */
  address: z.string().min(1).max(240),
  /** The glyph it wears in pickers, by its Lucide name; absent, it wears a pin. */
  icon: z.string().max(60).optional(),
  /** Google's id for it and where it is, kept when a suggestion was chosen so the map is free. */
  placeId: z.string().max(200).nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type SavedLocation = z.infer<typeof locationSchema>;

export const travelSchema = z.object({
  /** The places worth naming. Empty means journeys are only worked out from where you are now. */
  locations: z.array(locationSchema).max(20),
  /** Which one a journey starts from unless an event says otherwise; null is "where I am now". */
  defaultLocationId: z.string().max(64).nullable(),
  /** The ways you'd consider going, in the order you'd consider them. */
  modes: z.array(z.enum(TRAVEL_MODES)).max(TRAVEL_MODES.length),
  /** Minutes to be there early, added to every journey. */
  bufferMinutes: z.number().int().min(0).max(120),
});

/** A wall-clock time of day, as the settings panel writes it. */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be a time like 18:00");

export const sessionsSchema = z.object({
  enabled: z.boolean(),
  /** Looking back on the day, and planning tomorrow while it is still tonight. */
  eveningTime: timeOfDay,
  /** Yesterday, and what today could be — for whoever would rather plan over coffee. */
  morningTime: timeOfDay,
  /** 1 is Monday, 7 is Sunday. The longer sitting rides on that evening's reminder. */
  weeklyWeekday: z.number().int().min(1).max(7),
  weeklyTime: timeOfDay,
  /** Which of the two sittings the user means to plan in. The other one only reviews. */
  planWhen: z.enum(["evening", "morning"]),
  /**
   * The zone the phone last said it was in. Written by the app rather than chosen in the panel:
   * a day is a day in a place, and the server has no other way to know which place.
   */
  timeZone: z.string().max(64),
});

/**
 * A zone worth naming — "Kyiv", "Prague" — so an event can be put in it by the name the person
 * uses rather than the one the database does. The id is made by the client, like a place's.
 */
const zoneSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(60),
  /** The IANA name, which is what the calendar is actually told. */
  zone: z.string().min(1).max(64),
});

export const zonesSchema = z.object({
  saved: z.array(zoneSchema).max(20),
  /** The hours' columns beside the week grid, as IANA names. Empty means the device's own zone. */
  columns: z.array(z.string().min(1).max(64)).max(5),
});

/** Which of an event card's sections are folded away. Empty means every section is drawn. */
export const cardSchema = z.object({
  hidden: z.array(z.string().max(40)).max(20),
});

/**
 * When each integration feed was last read, by the device that can read it — "apple-health:sleep"
 * to an ISO instant. The feed itself is only readable on one device, so this is how every other
 * screen knows the account has it at all.
 */
export const integrationsSchema = z.object({
  synced: z.record(z.string().max(80), z.string().datetime()),
});

/**
 * What each connected calendar account is called here — "Work", "Personal" — by the account's own
 * id. The address is what Google knows it by; the name is what a person does, and what they type
 * to pick it.
 */
export const accountsSchema = z.object({
  aliases: z.record(z.string().max(80), z.string().trim().max(60)),
});

const preferencesSchema = z.object({
  reminders: remindersSchema,
  travel: travelSchema,
  sessions: sessionsSchema,
  zones: zonesSchema,
  card: cardSchema,
  integrations: integrationsSchema,
  accounts: accountsSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** One section at a time, one setting at a time, both partial — what `PATCH /preferences` takes. */
export const preferencesPatchFields = {
  reminders: remindersSchema.partial().optional(),
  travel: travelSchema.partial().optional(),
  sessions: sessionsSchema.partial().optional(),
  zones: zonesSchema.partial().optional(),
  card: cardSchema.partial().optional(),
  integrations: integrationsSchema.partial().optional(),
  accounts: accountsSchema.partial().optional(),
};
export type PreferencesPatch = z.infer<z.ZodObject<typeof preferencesPatchFields>>;
