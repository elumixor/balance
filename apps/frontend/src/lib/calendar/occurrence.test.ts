import { describe, expect, it } from "vitest";
import { isFirstOccurrence, originalStart } from "./occurrence";

describe("originalStart", () => {
  it("reads a timed occurrence's birth out of its id", () => {
    expect(originalStart("abc_20260907T090000Z")?.toISOString()).toBe("2026-09-07T09:00:00.000Z");
  });
  it("reads an all-day occurrence's day", () => {
    expect(originalStart("abc_20260907")?.toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });
  it("answers null for an id that carries no date", () => {
    expect(originalStart("abc")).toBeNull();
    expect(originalStart("abc_2026")).toBeNull();
  });
});

describe("isFirstOccurrence", () => {
  const seriesStart = "2026-09-07T09:00:00.000Z";
  it("is the first when born where the series starts", () => {
    expect(isFirstOccurrence({ id: "m_20260907T090000Z", seriesStart })).toBe(true);
  });
  it("is not the first when born later — even after being dragged earlier", () => {
    expect(isFirstOccurrence({ id: "m_20260908T090000Z", seriesStart })).toBe(false);
  });
  it("compares an all-day occurrence by day, whatever zone the master started in", () => {
    expect(isFirstOccurrence({ id: "m_20260907", seriesStart: "2026-09-06T22:00:00.000Z" })).toBe(true);
    expect(isFirstOccurrence({ id: "m_20260908", seriesStart: "2026-09-06T22:00:00.000Z" })).toBe(false);
  });
  it("offers the choice when it can't tell", () => {
    expect(isFirstOccurrence({ id: "m_20260907T090000Z", seriesStart: null })).toBe(false);
    expect(isFirstOccurrence({ id: "plain", seriesStart })).toBe(false);
  });
});
