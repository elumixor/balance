"use client";

import { useRef, useState } from "react";

export type SplitSegment = {
  id: string;
  label: string;
  color: string;
  /** Percent, 0-100. All segments' values must sum to 100. */
  value: number;
  /** Non-draggable segments (e.g. the implicit "Free time" slice) can still be resized from their draggable neighbor. */
  locked?: boolean;
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const sweep = end - start;
  const largeArc = sweep > 180 ? 1 : 0;
  const clampedEnd = sweep >= 359.999 ? start + 359.999 : end;
  const outerStart = polarToCartesian(cx, cy, rOuter, start);
  const outerEnd = polarToCartesian(cx, cy, rOuter, clampedEnd);
  const innerEnd = polarToCartesian(cx, cy, rInner, clampedEnd);
  const innerStart = polarToCartesian(cx, cy, rInner, start);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

const ANGLE_START = -90;
const MIN_GAP_PERCENT = 0;

/**
 * A circular editor: N segments around a ring, draggable handles at every boundary
 * except the one closing the ring back to the first segment (a fixed top seam).
 * Dragging a handle redistributes percentage between its two neighboring segments only.
 */
export function PieSplitEditor({
  segments,
  onChange,
  size = 200,
  thickness = 36,
}: {
  segments: SplitSegment[];
  onChange: (values: number[]) => void;
  size?: number;
  thickness?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2;
  const rInner = rOuter - thickness;
  const rHandle = (rOuter + rInner) / 2;

  const cumulative: number[] = [];
  segments.reduce((sum, s) => {
    const next = sum + s.value;
    cumulative.push(next);
    return next;
  }, 0);

  const arcs = segments.map((s, i) => {
    const start = ANGLE_START + (cumulative[i] - s.value) * 3.6;
    const end = ANGLE_START + cumulative[i] * 3.6;
    return { ...s, start, end };
  });

  // Draggable boundaries: between segment i and i+1, for i = 0..N-2 (the wrap boundary is a fixed seam).
  const boundaryCount = segments.length - 1;

  function angleFromPointer(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = size / rect.width;
    const scaleY = size / rect.height;
    const x = (clientX - rect.left) * scaleX - cx;
    const y = (clientY - rect.top) * scaleY - cy;
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    // percent along the circle starting at ANGLE_START, going clockwise, 0-100.
    const percent = (((deg - ANGLE_START + 360) % 360) / 360) * 100;
    return percent;
  }

  function handlePointerMove(boundaryIndex: number, clientX: number, clientY: number) {
    const percent = angleFromPointer(clientX, clientY);
    if (percent === null) return;

    const lowerBound = boundaryIndex === 0 ? 0 : cumulative[boundaryIndex - 1];
    const upperBound = cumulative[boundaryIndex + 1];
    const clamped = Math.min(Math.max(percent, lowerBound + MIN_GAP_PERCENT), upperBound - MIN_GAP_PERCENT);

    const nextValues = segments.map((s) => s.value);
    nextValues[boundaryIndex] = Math.round((clamped - lowerBound) * 10) / 10;
    nextValues[boundaryIndex + 1] = Math.round((upperBound - clamped) * 10) / 10;
    onChange(nextValues);
  }

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="touch-none select-none"
      onPointerMove={(e) => {
        if (draggingIndex === null) return;
        handlePointerMove(draggingIndex, e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (draggingIndex === null) return;
        (e.target as Element).releasePointerCapture?.(e.pointerId);
        setDraggingIndex(null);
      }}
    >
      {arcs.map((arc) => (
        <path key={arc.id} d={arcPath(cx, cy, rOuter, rInner, arc.start, arc.end)} fill={arc.color} opacity={0.9} />
      ))}
      {Array.from({ length: boundaryCount }, (_, i) => i).map((boundaryIndex) => {
        const angle = ANGLE_START + cumulative[boundaryIndex] * 3.6;
        const pos = polarToCartesian(cx, cy, rHandle, angle);
        return (
          <circle
            key={boundaryIndex}
            cx={pos.x}
            cy={pos.y}
            r={8}
            className="cursor-grab fill-background stroke-foreground stroke-2 active:cursor-grabbing"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDraggingIndex(boundaryIndex);
            }}
          />
        );
      })}
    </svg>
  );
}
