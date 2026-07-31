"use client";

export type PieSegment = {
  id: string;
  label: string;
  color: string;
  value: number;
};

function buildArcs(segments: PieSegment[]) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let cursor = -90;
  return segments.map((s) => {
    const sweep = (s.value / total) * 360;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    return { ...s, start, end, sweep };
  });
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const sweep = end - start;
  const largeArc = sweep > 180 ? 1 : 0;
  // A near-full circle needs a tiny gap or the arc path degenerates; clamp just under 360.
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

/** A static donut chart with a legend. Values are shown proportionally; labels include the raw value via `formatValue`. */
export function PieChart({
  segments,
  size = 160,
  thickness = 28,
  formatValue = (v) => `${v}`,
  centerLabel,
}: {
  segments: PieSegment[];
  size?: number;
  thickness?: number;
  formatValue?: (value: number) => string;
  centerLabel?: { primary: string; secondary?: string };
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2;
  const rInner = rOuter - thickness;
  const arcs = buildArcs(segments.filter((s) => s.value > 0));
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs.length === 0 ? (
            <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke="var(--border)" strokeWidth={thickness} />
          ) : (
            arcs.map((arc) => (
              <path key={arc.id} d={arcPath(cx, cy, rOuter, rInner, arc.start, arc.end)} fill={arc.color} />
            ))
          )}
        </svg>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-semibold leading-tight">{centerLabel.primary}</span>
            {centerLabel.secondary && (
              <span className="text-xs text-muted-foreground leading-tight">{centerLabel.secondary}</span>
            )}
          </div>
        )}
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {segments.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">
              {formatValue(s.value)}
              {total > 0 && ` (${((s.value / total) * 100).toFixed(0)}%)`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
