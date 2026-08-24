import { beforeEach, describe, expect, it } from "vitest";
import { anchoredScrollTop, timeScale } from "./time-scale.svelte";
import { HOUR_PX, MAX_HOUR_PX } from "./week-grid";

/** A phone-ish grid: a day this tall can't be squeezed below 25px an hour. */
const WINDOW_PX = 600;
const FLOOR = WINDOW_PX / 24;

/** A pinch, start to finish, as the grid drives it. */
function pinch(...factors: number[]) {
  timeScale.beginPinch();
  const ratios = factors.map((factor) => timeScale.pinchTo(factor));
  timeScale.endPinch();
  return ratios;
}

describe("timeScale", () => {
  beforeEach(() => {
    localStorage.clear();
    timeScale.fit(WINDOW_PX);
    pinch(HOUR_PX / timeScale.hourPx);
    localStorage.clear();
  });

  it("scales the hour by the pinch and reports how far it moved", () => {
    expect(timeScale.hourPx).toBe(HOUR_PX);
    const [ratio] = pinch(2);
    expect(ratio).toBe(2);
    expect(timeScale.hourPx).toBe(HOUR_PX * 2);
  });

  it("measures the whole gesture from where it started, not from the last step", () => {
    // Fingers out to double, back to where they began: the scale has to land back where it was.
    timeScale.beginPinch();
    timeScale.pinchTo(2);
    timeScale.pinchTo(1);
    timeScale.endPinch();
    expect(timeScale.hourPx).toBe(HOUR_PX);
  });

  it("picks up where the last gesture left off", () => {
    pinch(2);
    pinch(1.5);
    expect(timeScale.hourPx).toBe(HOUR_PX * 3);
  });

  it("holds at both stops, and says so with a ratio of 1", () => {
    expect(pinch(1000)).toEqual([MAX_HOUR_PX / HOUR_PX]);
    expect(timeScale.hourPx).toBe(MAX_HOUR_PX);
    expect(pinch(1000)).toEqual([1]);

    expect(pinch(0.001)).toEqual([FLOOR / MAX_HOUR_PX]);
    expect(pinch(0.001)).toEqual([1]);
    expect(timeScale.hourPx).toBe(FLOOR);
  });

  it("never squeezes the day smaller than the window it's drawn in", () => {
    pinch(0.001);
    expect(timeScale.hourPx * 24).toBe(WINDOW_PX);
    // A taller window pulls the grid open with it rather than leaving a gap under midnight.
    timeScale.fit(WINDOW_PX * 2);
    expect(timeScale.hourPx * 24).toBe(WINDOW_PX * 2);
  });

  it("lets a window taller than the ceiling past it, since fitting is the harder rule", () => {
    const tall = MAX_HOUR_PX * 24 * 2;
    timeScale.fit(tall);
    expect(timeScale.minHourPx).toBe(tall / 24);
    expect(timeScale.maxHourPx).toBe(tall / 24);
    expect(timeScale.hourPx).toBe(tall / 24);
  });

  it("ignores a measurement of a grid that isn't on screen yet", () => {
    timeScale.fit(0);
    expect(timeScale.minHourPx).toBe(FLOOR);
  });

  it("falls back to the resting scale before the grid has been measured", () => {
    const fresh = new (timeScale.constructor as new () => typeof timeScale)();
    expect(fresh.minHourPx).toBe(HOUR_PX);
    expect(fresh.maxHourPx).toBe(MAX_HOUR_PX);
  });

  it("opens at the scale the device was left at", () => {
    pinch(2);
    timeScale.start();
    expect(timeScale.hourPx).toBe(HOUR_PX * 2);
  });

  it("ignores a stored scale that isn't one", () => {
    localStorage.setItem("balance.calendar-hour-px", "not a number");
    timeScale.start();
    expect(timeScale.hourPx).toBe(HOUR_PX);
    localStorage.setItem("balance.calendar-hour-px", "0");
    timeScale.start();
    expect(timeScale.hourPx).toBe(HOUR_PX);
  });

  it("holds a stored scale inside this window's stops", () => {
    localStorage.setItem("balance.calendar-hour-px", String(MAX_HOUR_PX * 10));
    timeScale.start();
    expect(timeScale.hourPx).toBe(MAX_HOUR_PX);
    localStorage.setItem("balance.calendar-hour-px", "1");
    timeScale.start();
    expect(timeScale.hourPx).toBe(FLOOR);
  });

  it("survives storage being unavailable", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      timeScale.start();
      expect(() => pinch(2)).not.toThrow();
      expect(timeScale.hourPx).toBe(HOUR_PX * 2);
    } finally {
      if (real) Object.defineProperty(globalThis, "localStorage", real);
    }
  });
});

describe("anchoredScrollTop", () => {
  it("keeps the time under the fingers under them", () => {
    // The hour at 380px down the grid is under a pinch centred 100px below a 60px header.
    const top = anchoredScrollTop(340, 100, 60, 2);
    // It was 340 + 100 - 60 = 380px into the grid; doubled that's 760, and it has to draw at 100.
    expect(top).toBe(60 + 760 - 100);
  });

  it("never scrolls above the top of the day", () => {
    // Squeezed hard while already at the top: the anchor would want to scroll past it.
    expect(anchoredScrollTop(0, 200, 60, 0.1)).toBe(0);
  });
});
