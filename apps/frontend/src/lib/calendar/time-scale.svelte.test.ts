import { beforeEach, describe, expect, it } from "vitest";
import { anchoredScrollTop, timeScale } from "./time-scale.svelte";
import { HOUR_PX, MAX_ZOOM, MIN_ZOOM } from "./week-grid";

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
    timeScale.beginPinch();
    timeScale.pinchTo(1 / timeScale.zoom);
    timeScale.endPinch();
    localStorage.clear();
  });

  it("scales the hour by the pinch and reports how far it moved", () => {
    expect(timeScale.hourPx).toBe(HOUR_PX);
    const [ratio] = pinch(2);
    expect(ratio).toBe(2);
    expect(timeScale.hourPx).toBe(HOUR_PX * 2);
  });

  it("measures the whole gesture from where it started, not from the last step", () => {
    // Fingers out to double, back to where they began: the scale has to land back on 1.
    timeScale.beginPinch();
    timeScale.pinchTo(2);
    timeScale.pinchTo(1);
    timeScale.endPinch();
    expect(timeScale.zoom).toBe(1);
  });

  it("picks up where the last gesture left off", () => {
    pinch(2);
    pinch(2);
    expect(timeScale.zoom).toBe(4);
  });

  it("holds at the limits, and says so with a ratio of 1", () => {
    expect(pinch(1000)).toEqual([MAX_ZOOM]);
    expect(pinch(1000)).toEqual([1]);
    expect(timeScale.zoom).toBe(MAX_ZOOM);

    pinch(1 / MAX_ZOOM);
    expect(pinch(0.001)).toEqual([MIN_ZOOM]);
    expect(timeScale.zoom).toBe(MIN_ZOOM);
  });

  it("opens at the scale the device was left at", () => {
    pinch(3);
    timeScale.start();
    expect(timeScale.zoom).toBe(3);
  });

  it("ignores a stored scale that isn't one", () => {
    localStorage.setItem("balance.calendar-zoom", "not a number");
    timeScale.start();
    expect(timeScale.zoom).toBe(1);
    localStorage.setItem("balance.calendar-zoom", "0");
    timeScale.start();
    expect(timeScale.zoom).toBe(1);
  });

  it("clamps a stored scale from an older build's limits", () => {
    localStorage.setItem("balance.calendar-zoom", String(MAX_ZOOM * 10));
    timeScale.start();
    expect(timeScale.zoom).toBe(MAX_ZOOM);
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
      expect(timeScale.zoom).toBe(2);
    } finally {
      if (real) Object.defineProperty(globalThis, "localStorage", real);
    }
  });
});

describe("anchoredScrollTop", () => {
  it("keeps the time under the fingers under them", () => {
    // The hour at 300px down the grid is under a pinch centred 100px below a 60px header.
    const top = anchoredScrollTop(340, 100, 60, 2);
    // It was 340 + 100 - 60 = 380px into the grid; doubled that's 760, and it has to draw at 100.
    expect(top).toBe(60 + 760 - 100);
  });

  it("never scrolls above the top of the day", () => {
    // Squeezed hard while already at the top: the anchor would want to scroll past it.
    expect(anchoredScrollTop(0, 200, 60, 0.1)).toBe(0);
  });
});
