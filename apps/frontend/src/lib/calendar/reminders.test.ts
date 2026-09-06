import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, type RemindersPrefs } from "$lib/account/preferences-types";
import { JOIN_LEAD_MS, popupMinutes, REMINDER_KINDS, reminderDueAt } from "./reminders";

const START = new Date("2026-03-10T09:00:00.000Z").getTime();

function options(overrides: Partial<Parameters<typeof reminderDueAt>[2]> = {}) {
  return {
    start: START,
    reminders: DEFAULT_PREFERENCES.reminders,
    travel: DEFAULT_PREFERENCES.travel,
    hasJoinLink: false,
    ...overrides,
  };
}

function reminders(patch: Partial<RemindersPrefs>): RemindersPrefs {
  return { ...DEFAULT_PREFERENCES.reminders, ...patch };
}

const plain = { allDay: false, reminders: null };

describe("reminderDueAt", () => {
  it("uses the lead-time preference for an event the calendar carries no reminder for", () => {
    expect(reminderDueAt(plain, "starts", options())).toBe(START - 5 * 60_000);
  });

  it("prefers the calendar's own popup reminder, and the soonest of several", () => {
    const event = {
      allDay: false,
      reminders: [
        { method: "popup" as const, minutes: 30 },
        { method: "popup" as const, minutes: 10 },
        { method: "email" as const, minutes: 1 },
      ],
    };
    expect(reminderDueAt(event, "starts", options())).toBe(START - 10 * 60_000);
  });

  it("ignores the calendar's reminders when the preference says to", () => {
    const event = { allDay: false, reminders: [{ method: "popup" as const, minutes: 30 }] };
    const opts = options({ reminders: reminders({ useCalendarReminders: false }) });
    expect(reminderDueAt(event, "starts", opts)).toBe(START - 5 * 60_000);
  });

  it("falls back to the preference when the calendar carries only email reminders", () => {
    const event = { allDay: false, reminders: [{ method: "email" as const, minutes: 45 }] };
    expect(reminderDueAt(event, "starts", options())).toBe(START - 5 * 60_000);
  });

  it("reminds about a meeting a minute before it starts, whatever the lead time is", () => {
    const opts = options({ hasJoinLink: true, reminders: reminders({ leadMinutes: 20 }) });
    expect(reminderDueAt(plain, "join", opts)).toBe(START - JOIN_LEAD_MS);
  });

  it("has nothing to join when the event isn't a call", () => {
    expect(reminderDueAt(plain, "join", options())).toBeNull();
  });

  it("times setting off off the journey and the buffer", () => {
    const opts = options({ journey: { seconds: 20 * 60 }, travel: { bufferMinutes: 5 } });
    expect(reminderDueAt(plain, "leave", opts)).toBe(START - 25 * 60_000);
  });

  it("says nothing about setting off with no journey looked up, or with it switched off", () => {
    expect(reminderDueAt(plain, "leave", options({ journey: null }))).toBeNull();
    expect(reminderDueAt(plain, "leave", options())).toBeNull();
    const off = options({ journey: { seconds: 600 }, reminders: reminders({ leaveInTime: false }) });
    expect(reminderDueAt(plain, "leave", off)).toBeNull();
  });

  it("says nothing at all with reminders off, or about an all-day event", () => {
    const off = options({ hasJoinLink: true, reminders: reminders({ enabled: false }) });
    const allDay = { allDay: true, reminders: null };
    for (const kind of REMINDER_KINDS) {
      expect(reminderDueAt(plain, kind, off)).toBeNull();
      expect(reminderDueAt(allDay, kind, options({ hasJoinLink: true, journey: { seconds: 60 } }))).toBeNull();
    }
  });

  it("counts a zero lead time as the start itself, not as no preference at all", () => {
    const opts = options({ reminders: reminders({ leadMinutes: 0 }) });
    expect(reminderDueAt(plain, "starts", opts)).toBe(START);
  });
});

describe("popupMinutes", () => {
  it("is null for an event with no reminders and for one with no popup among them", () => {
    expect(popupMinutes({ reminders: null })).toBeNull();
    expect(popupMinutes({ reminders: [] })).toBeNull();
    expect(popupMinutes({ reminders: [{ method: "email", minutes: 5 }] })).toBeNull();
  });
});
