import { useRef, useState } from "react";
import type { View } from "react-native";
import { RING_START } from "./arc";
import type { RingSegment } from "./week-ring";

/**
 * Tracks the ring's drag origin and which seam (if any) is being dragged, and turns
 * absolute touch coordinates into a slice reassignment between two neighbouring segments.
 */
export function useSeamDrag(
  segments: RingSegment[],
  bounds: number[],
  total: number,
  onChange: (values: number[]) => void,
) {
  const containerRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<number | null>(null);

  function captureOrigin() {
    containerRef.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
  }

  function fractionFromPoint(cx: number, cy: number, absoluteX: number, absoluteY: number) {
    const x = absoluteX - origin.current.x - cx;
    const y = absoluteY - origin.current.y - cy;
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return ((deg - RING_START + 360) % 360) / 360;
  }

  function moveSeam(cx: number, cy: number, index: number, absoluteX: number, absoluteY: number) {
    const raw = fractionFromPoint(cx, cy, absoluteX, absoluteY) * total;
    const reference = bounds[index];
    let value = raw;
    while (value - reference > total / 2) value -= total;
    while (value - reference < -total / 2) value += total;

    const lower = index === 0 ? 0 : bounds[index - 1];
    const upper = bounds[index + 1];
    const clamped = Math.min(Math.max(value, lower), upper);

    const next = segments.map((s) => s.value);
    next[index] = Math.round((clamped - lower) * 10) / 10;
    next[index + 1] = Math.round((upper - clamped) * 10) / 10;
    onChange(next);
  }

  return { containerRef, captureOrigin, dragging, setDragging, moveSeam };
}
