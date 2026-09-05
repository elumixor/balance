import { describe, expect, it } from "vitest";
import { DAY_STARS, dayRating } from "./rating";

describe("dayRating", () => {
  const threshold = 0.7;

  it("lights every star for a day kept to the bar", () => {
    expect(dayRating({ coverage: 0.7, rest: false }, threshold)).toBe(DAY_STARS);
    expect(dayRating({ coverage: 1, rest: false }, threshold)).toBe(DAY_STARS);
  });

  it("lights every star for a rest day, whatever its hours", () => {
    expect(dayRating({ coverage: 0, rest: true }, threshold)).toBe(DAY_STARS);
  });

  it("lights two for most of a day", () => {
    expect(dayRating({ coverage: 0.35, rest: false }, threshold)).toBe(2);
    expect(dayRating({ coverage: 0.69, rest: false }, threshold)).toBe(2);
  });

  it("lights one for any hour given a meaning", () => {
    expect(dayRating({ coverage: 0.01, rest: false }, threshold)).toBe(1);
    expect(dayRating({ coverage: 0.34, rest: false }, threshold)).toBe(1);
  });

  it("lights none for a day with nothing mapped", () => {
    expect(dayRating({ coverage: 0, rest: false }, threshold)).toBe(0);
  });
});
