import { describe, expect, it } from "vitest";
import {
  hexToHsl,
  hslToHex,
  hueOf,
  INK_LIGHTNESS,
  INK_SATURATION,
  restColor,
  swatchPalette,
  withAlpha,
  withHue,
} from "./colors";

describe("withAlpha", () => {
  it("appends two hex digits", () => {
    expect(withAlpha("#C4553B", 1)).toBe("#C4553Bff");
    expect(withAlpha("#C4553B", 0)).toBe("#C4553B00");
    expect(withAlpha("#C4553B", 0.5)).toBe("#C4553B80");
  });

  it("clamps rather than producing a colour no browser will parse", () => {
    expect(withAlpha("#C4553B", 2)).toBe("#C4553Bff");
    expect(withAlpha("#C4553B", -1)).toBe("#C4553B00");
  });
});

describe("hexToHsl / hslToHex", () => {
  it("round-trips every swatch the app ships", () => {
    for (const swatch of [...swatchPalette, restColor]) {
      expect(hslToHex(hexToHsl(swatch)).toLowerCase()).toBe(swatch.toLowerCase());
    }
  });

  it("reads a grey as having no hue and no saturation", () => {
    expect(hexToHsl("#808080")).toEqual({ h: 0, s: 0, l: expect.closeTo(50.2, 1) });
    expect(hueOf("#000000")).toBe(0);
    expect(hueOf("#ffffff")).toBe(0);
  });

  it("puts the primaries where they belong on the wheel", () => {
    expect(hueOf("#ff0000")).toBe(0);
    expect(hueOf("#00ff00")).toBe(120);
    expect(hueOf("#0000ff")).toBe(240);
    expect(hueOf("#00ffff")).toBe(180);
  });

  it("meets itself at both ends of the wheel", () => {
    expect(hslToHex({ h: 360, s: 100, l: 50 })).toBe(hslToHex({ h: 0, s: 100, l: 50 }));
  });

  it("covers every sixth of the wheel", () => {
    const hexes = [0, 60, 120, 180, 240, 300, 359].map((h) => hslToHex({ h, s: 52, l: 50 }));
    expect(new Set(hexes).size).toBe(7);
    expect(hexes.every((hex) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
  });
});

describe("withHue", () => {
  it("turns the hue and leaves the weight of the colour alone", () => {
    const turned = withHue("#C4553B", 200);
    const before = hexToHsl("#C4553B");
    const after = hexToHsl(turned);
    expect(after.h).toBeCloseTo(200, 0);
    expect(after.s).toBeCloseTo(before.s, 0);
    expect(after.l).toBeCloseTo(before.l, 0);
  });

  it("gives a near-grey the palette's own weight, since it has none to keep", () => {
    const after = hexToHsl(withHue("#7f8081", 120));
    expect(after.s).toBeCloseTo(INK_SATURATION, 0);
    expect(after.l).toBeCloseTo(INK_LIGHTNESS, 0);
  });

  it("is stable when asked for the hue a colour already has", () => {
    const swatch = swatchPalette[4];
    expect(withHue(swatch, hueOf(swatch)).toLowerCase()).toBe(swatch.toLowerCase());
  });
});
