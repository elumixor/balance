import { describe, expect, it } from "bun:test";
import { sharedDurations } from "./overlap";

const MIN = 60_000;
const span = (fromMin: number, toMin: number) => ({ start: fromMin * MIN, end: toMin * MIN });
const minutes = (credits: number[]) => credits.map((ms) => ms / MIN);

describe("sharedDurations", () => {
  it("gives a lone span its whole length", () => {
    expect(minutes(sharedDurations([span(0, 45)]))).toEqual([45]);
  });

  it("leaves spans that only touch whole", () => {
    expect(minutes(sharedDurations([span(0, 30), span(30, 60)]))).toEqual([30, 30]);
  });

  it("splits the shared stretch evenly: 45m from 0, 30m from 15", () => {
    expect(minutes(sharedDurations([span(0, 45), span(15, 45)]))).toEqual([30, 15]);
  });

  it("splits a stretch three ways where three run at once", () => {
    expect(minutes(sharedDurations([span(0, 60), span(0, 60), span(30, 60)]))).toEqual([25, 25, 10]);
  });

  it("credits a span inside another half its length", () => {
    expect(minutes(sharedDurations([span(0, 60), span(20, 40)]))).toEqual([50, 10]);
  });

  it("adds up to the time covered, not the time booked", () => {
    const credits = sharedDurations([span(0, 45), span(15, 75), span(60, 90)]);
    expect(credits.reduce((sum, ms) => sum + ms, 0) / MIN).toBe(90);
  });

  it("clips to the window before sharing", () => {
    expect(minutes(sharedDurations([span(0, 60), span(30, 90)], span(45, 120)))).toEqual([7.5, 37.5]);
  });

  it("credits nothing to a span outside the window or of no length", () => {
    expect(minutes(sharedDurations([span(0, 30), span(40, 40)], span(60, 120)))).toEqual([0, 0]);
  });
});
