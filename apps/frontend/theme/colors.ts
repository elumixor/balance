/**
 * Balance keeps its chrome achromatic on purpose: the only hue in the app comes
 * from the user's own categories, so every week plan colours the app differently.
 */
export const palette = {
  light: {
    bg: "#F6F6F4",
    surface: "#FFFFFF",
    surfaceAlt: "#EEEEEB",
    line: "#E2E2DD",
    lineStrong: "#C7C7C0",
    text: "#15171A",
    textMuted: "#6A6F75",
    textFaint: "#9BA1A7",
    ink: "#15171A",
    inkText: "#FFFFFF",
    danger: "#B3402F",
    positive: "#2E7D5B",
    caution: "#A8761F",
    overlay: "rgba(21,23,26,0.32)",
  },
  dark: {
    bg: "#0E1013",
    surface: "#16191C",
    surfaceAlt: "#1E2226",
    line: "#262B30",
    lineStrong: "#3A4046",
    text: "#F1F2F0",
    textMuted: "#949AA1",
    textFaint: "#6A7076",
    ink: "#F1F2F0",
    inkText: "#0E1013",
    danger: "#E4796A",
    positive: "#62BF97",
    caution: "#D9A54B",
    overlay: "rgba(0,0,0,0.55)",
  },
} as const;

export type ThemeColors = { [K in keyof typeof palette.light]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;

/** Low radii on purpose — the ring is the only round thing that matters. */
export const radii = { sm: 4, md: 6, lg: 10, full: 999 } as const;

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

export function withAlpha(hex: string, alpha: number) {
  const value = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${value}`;
}
