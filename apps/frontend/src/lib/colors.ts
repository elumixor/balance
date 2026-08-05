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
