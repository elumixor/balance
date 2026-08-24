import { describe, expect, it } from "bun:test";
import { isFresh, upcomingSlots } from "./schedule";

const PRAGUE = "Europe/Prague";
const preferences = {
  enabled: true,
  eveningTime: "18:00",
  morningTime: "08:00",
  weeklyWeekday: 7,
  weeklyTime: "18:00",
};

const at = (iso: string) => new Date(iso);

describe("upcomingSlots", () => {
  it("gives nothing when the sessions are switched off", () => {
    expect(
      upcomingSlots({
        preferences: { ...preferences, enabled: false },
        timeZone: PRAGUE,
        now: at("2026-08-24T09:00:00Z"),
      }),
    ).toEqual([]);
  });

  it("skips the slots that have already gone past today", () => {
    // 09:00 Prague on a Monday: this morning is behind, this evening is not.
    const slots = upcomingSlots({ preferences, timeZone: PRAGUE, now: at("2026-08-24T07:00:00Z") });
    expect(slots[0]).toEqual({ slot: "evening", day: "2026-08-24", at: at("2026-08-24T16:00:00Z") });
    expect(slots[1]?.slot).toBe("morning");
    expect(slots[1]?.day).toBe("2026-08-25");
  });

  it("replaces Sunday evening with the weekly sitting rather than adding to it", () => {
    const slots = upcomingSlots({ preferences, timeZone: PRAGUE, now: at("2026-08-30T07:00:00Z") });
    const sunday = slots.filter((slot) => slot.day === "2026-08-30");
    expect(sunday.map((slot) => slot.slot)).toEqual(["weekly"]);
    expect(sunday[0]?.at.toISOString()).toBe("2026-08-30T16:00:00.000Z");
  });

  it("honours a weekly slot on another day, and its own time", () => {
    const slots = upcomingSlots({
      preferences: { ...preferences, weeklyWeekday: 1, weeklyTime: "20:00" },
      timeZone: PRAGUE,
      now: at("2026-08-24T07:00:00Z"),
    });
    expect(slots[0]).toEqual({ slot: "weekly", day: "2026-08-24", at: at("2026-08-24T18:00:00Z") });
  });

  it("stops at the horizon", () => {
    const slots = upcomingSlots({
      preferences,
      timeZone: PRAGUE,
      now: at("2026-08-24T07:00:00Z"),
      horizonMs: 60 * 60_000,
    });
    expect(slots.length).toBe(0);
  });

  it("keeps the wall-clock hour across a change of clocks", () => {
    // Saturday morning before Prague falls back on Sunday 2026-10-25.
    const slots = upcomingSlots({ preferences, timeZone: PRAGUE, now: at("2026-10-24T05:00:00Z") });
    const sunday = slots.find((slot) => slot.day === "2026-10-25" && slot.slot === "morning");
    // 08:00 on the Sunday is +01:00, not the +02:00 it was the day before.
    expect(sunday?.at.toISOString()).toBe("2026-10-25T07:00:00.000Z");
  });

  it("is in order, soonest first", () => {
    const slots = upcomingSlots({ preferences, timeZone: PRAGUE, now: at("2026-08-24T07:00:00Z") });
    const times = slots.map((slot) => slot.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("isFresh", () => {
  const slot = { slot: "evening" as const, day: "2026-08-24", at: at("2026-08-24T16:00:00Z") };

  it("is fresh within three hours of firing, and not at breakfast", () => {
    expect(isFresh(slot, at("2026-08-24T14:00:00Z"))).toBe(true);
    expect(isFresh(slot, at("2026-08-24T06:00:00Z"))).toBe(false);
  });
});
