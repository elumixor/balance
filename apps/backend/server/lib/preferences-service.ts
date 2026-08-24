import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { userPreferences } from "../db/schema";
import { TRAVEL_MODES } from "./travel";

/**
 * The app's own preferences, kept per account rather than per device.
 *
 * Only the macOS app can act on most of these — a browser tab has nowhere to put a reminder card
 * — but the settings panel shows them everywhere, so setting them on a phone has to reach the Mac
 * that will use them. That is the whole reason they aren't in `localStorage`.
 */

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
export const locationSchema = z.object({
  id: z.string().min(1).max(64),
  /** What the user calls it: "Home", "Office". */
  label: z.string().min(1).max(60),
  /** The address as Google Maps knows it — what the Routes API is actually asked about. */
  address: z.string().min(1).max(240),
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

export const preferencesSchema = z.object({
  reminders: remindersSchema,
  travel: travelSchema,
  sessions: sessionsSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;

const DEFAULTS: Preferences = {
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
};

export class PreferencesService {
  constructor(private readonly userId: string) {}

  /**
   * Always a whole answer. A row written by an older build is missing whatever was added since,
   * and a screen that has to cope with half a preference is a screen with two ideas of the
   * default in it.
   */
  async get(): Promise<Preferences> {
    const row = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, this.userId) });
    return merge(row?.data);
  }

  /** A patch of a patch: one section at a time, one setting at a time, both partial. */
  async update(patch: {
    reminders?: Partial<Preferences["reminders"]>;
    travel?: Partial<Preferences["travel"]>;
    sessions?: Partial<Preferences["sessions"]>;
  }) {
    const current = await this.get();
    const next: Preferences = {
      reminders: { ...current.reminders, ...patch.reminders },
      travel: { ...current.travel, ...patch.travel },
      sessions: { ...current.sessions, ...patch.sessions },
    };

    await db
      .insert(userPreferences)
      .values({ userId: this.userId, data: next })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { data: next, updatedAt: new Date() },
      });

    return next;
  }
}

/**
 * What a row can hold: anything the current shape recognises, and the one thing it used to.
 *
 * `origin` was a single address before there were named places. A row written by that build still
 * holds one, and it is the address the person actually leaves from — so it is read back as their
 * first location rather than dropped.
 */
const storedSchema = z.object({
  reminders: remindersSchema.partial().optional(),
  travel: travelSchema
    .partial()
    .extend({ origin: z.string().max(240).optional() })
    .optional(),
  sessions: sessionsSchema.partial().optional(),
});

const HOME_ID = "home";

/** Whatever is stored, read through the current shape — anything unreadable falls back. */
function merge(stored: unknown): Preferences {
  const parsed = storedSchema.safeParse(stored ?? {});
  const value = parsed.success ? parsed.data : {};
  const travel = { ...DEFAULTS.travel, ...value.travel };

  const legacy = value.travel?.origin?.trim();
  if (legacy && travel.locations.length === 0) {
    travel.locations = [{ id: HOME_ID, label: "Home", address: legacy }];
    travel.defaultLocationId = HOME_ID;
  }
  // A default pointing at a place that has since been deleted is the same as no default.
  if (travel.defaultLocationId && !travel.locations.some((one) => one.id === travel.defaultLocationId)) {
    travel.defaultLocationId = null;
  }

  return {
    reminders: { ...DEFAULTS.reminders, ...value.reminders },
    travel,
    sessions: { ...DEFAULTS.sessions, ...value.sessions },
  };
}
