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

export const travelSchema = z.object({
  /** Where you're coming from — an address, or empty for "don't work it out". */
  origin: z.string().max(240),
  /** The ways you'd consider going, in the order you'd consider them. */
  modes: z.array(z.enum(TRAVEL_MODES)).max(TRAVEL_MODES.length),
  /** Minutes to be there early, added to every journey. */
  bufferMinutes: z.number().int().min(0).max(120),
});

export const preferencesSchema = z.object({ reminders: remindersSchema, travel: travelSchema });
export type Preferences = z.infer<typeof preferencesSchema>;

const DEFAULTS: Preferences = {
  reminders: { enabled: true, leadMinutes: 5, useCalendarReminders: true, leaveInTime: true, sound: true },
  travel: { origin: "", modes: ["transit", "drive"], bufferMinutes: 5 },
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
  async update(patch: { reminders?: Partial<Preferences["reminders"]>; travel?: Partial<Preferences["travel"]> }) {
    const current = await this.get();
    const next: Preferences = {
      reminders: { ...current.reminders, ...patch.reminders },
      travel: { ...current.travel, ...patch.travel },
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

/** What a row can hold: anything the current shape recognises, and nothing else. */
const storedSchema = z.object({
  reminders: remindersSchema.partial().optional(),
  travel: travelSchema.partial().optional(),
});

/** Whatever is stored, read through the current shape — anything unreadable falls back. */
function merge(stored: unknown): Preferences {
  const parsed = storedSchema.safeParse(stored ?? {});
  const value = parsed.success ? parsed.data : {};
  return {
    reminders: { ...DEFAULTS.reminders, ...value.reminders },
    travel: { ...DEFAULTS.travel, ...value.travel },
  };
}
