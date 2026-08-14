/**
 * Risograph-ink swatches: even luminance so a ring built from any combination
 * reads as one designed object, and every colour holds up on both themes.
 */
export const swatchPalette = [
  "#C4553B",
  "#CE7B36",
  "#B8983A",
  "#7E9B45",
  "#40966F",
  "#3B8E9E",
  "#3E7BB5",
  "#6B6DB8",
  "#9A5EA8",
  "#B94E82",
];

/** Unallocated hours and untracked activity share this neutral. */
export const restColor = "#8A9097";

/**
 * The saturation and lightness the palette is built on. A hue picked by hand borrows them, so a
 * hand-tuned category still sits at the same weight as the swatches next to it in the ring.
 */
export const INK_SATURATION = 52;
export const INK_LIGHTNESS = 50;

export function withAlpha(hex: string, alpha: number) {
  const value = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${value}`;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** The hue of a colour, 0–360. A grey has no hue of its own, so it reads as red's zero. */
export const hueOf = (hex: string) => Math.round(hexToHsl(hex).h);

/**
 * Turns the hue dial without touching how strong or how light the colour is — unless the colour
 * is a near-grey, which has nothing to preserve, and takes the palette's own weight instead.
 */
export function withHue(hex: string, hue: number): string {
  const { s, l } = hexToHsl(hex);
  const flat = s < 12;
  return hslToHex({
    h: hue,
    s: flat ? INK_SATURATION : s,
    l: flat ? INK_LIGHTNESS : l,
  });
}

export function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;

  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;

  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
