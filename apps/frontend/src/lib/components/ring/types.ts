/** A stacked-bar slice: an activity's share of one category. */
export type Split = { id: string; color: string; value: number };

export type RingSegment = {
  id: string;
  label: string;
  color: string;
  /** Drawn in the band when the slice is wide enough to hold it. */
  icon?: string;
  /** Values share one unit; the ring maps their sum onto 360°. */
  value: number;
};
