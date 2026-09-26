import { z } from "zod";
import {
  accountsSchema,
  cardSchema,
  integrationsSchema,
  type Preferences,
  remindersSchema,
  sessionsSchema,
  travelSchema,
  zonesSchema,
} from "./schema";

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
  zones: { saved: [], columns: [] },
  card: { hidden: [] },
  integrations: { synced: {} },
  accounts: { aliases: {} },
};

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
  zones: zonesSchema.partial().optional(),
  card: cardSchema.partial().optional(),
  integrations: integrationsSchema.partial().optional(),
  accounts: accountsSchema.partial().optional(),
});

const HOME_ID = "home";

/** Whatever is stored, read through the current shape — anything unreadable falls back. */
export function merge(stored: unknown): Preferences {
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
    zones: { ...DEFAULTS.zones, ...value.zones },
    card: { ...DEFAULTS.card, ...value.card },
    integrations: { ...DEFAULTS.integrations, ...value.integrations },
    accounts: { ...DEFAULTS.accounts, ...value.accounts },
  };
}
