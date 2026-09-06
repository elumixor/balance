<script lang="ts" module>
  import { pointOnRing } from "$lib/components/ring/Arc.svelte";

  /** What one category is owed and what it has had, in the order the dial should draw them. */
  export interface DialSegment {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly icon: string;
    readonly plannedHours: number;
    readonly actualHours: number;
    /** Rest and buffer time: it holds its muted colour and never reads as overspent. */
    readonly muted?: boolean;
  }

  /**
   * The outline of one band segment: out along the arc at the outer edge, straight across the
   * band, back along the inner edge. Stroking this rather than filling it is what leaves the
   * segment empty until the hours arrive.
   */
  export function segmentOutline(
    cx: number,
    cy: number,
    outer: number,
    inner: number,
    start: number,
    sweep: number,
  ) {
    const large = sweep > 0.5 ? 1 : 0;
    const a = pointOnRing(cx, cy, outer, start);
    const b = pointOnRing(cx, cy, outer, start + sweep);
    const c = pointOnRing(cx, cy, inner, start + sweep);
    const d = pointOnRing(cx, cy, inner, start);
    return `M${a.x} ${a.y}A${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y}L${c.x} ${c.y}A${inner} ${inner} 0 ${large} 0 ${d.x} ${d.y}Z`;
  }
</script>

<script lang="ts">
  import { formatHoursDecimal } from "$lib/ui/format";
  import { iconFor } from "$lib/ui/icons/index";
  import { theme } from "$lib/ui/theme.svelte";
  import { MIN_ICON_FRACTION, ringRadius } from "$lib/components/ring/WeekRing.svelte";

  /**
   * The week as one dial instead of a row of small rings: every category is a segment whose width
   * is the share of the week it was promised, outlined in its own colour and filled outward from
   * the middle of the dial as the hours are actually spent — the segment thickens rather than
   * creeping around, so a glance down the ring compares depths and not arc lengths. A band filled
   * to its outer edge means the plan was met; past that the segment turns the same red an overrun
   * bar does, so the ring can be read at a glance without a legend beside it.
   *
   * The readout lives in the middle rather than in a bubble, because this sits in a rail barely
   * wider than the dial itself — a tooltip would cover the very segment it describes.
   */
  let {
    segments,
    size = 180,
    thickness = 32,
    label = "Time spent against plan, by category",
  }: {
    segments: readonly DialSegment[];
    size?: number;
    thickness?: number;
    /** What the dial as a whole is, for the screen reader. */
    label?: string;
  } = $props();

  /** The hairline the empty segment is drawn with, and the room the fill keeps clear of it. */
  const OUTLINE_WIDTH = 1.25;
  const FILL_INSET = 1.5;
  /** A seam wide enough to tell neighbouring segments apart without eating a sliver. */
  const GAP_FRACTION = 0.006;

  let focused = $state<number | null>(null);

  const c = $derived(size / 2);
  const r = $derived(ringRadius(size, thickness));
  const outerR = $derived(r + thickness / 2 - OUTLINE_WIDTH / 2);
  const innerR = $derived(r - thickness / 2 + OUTLINE_WIDTH / 2);
  /** The room the fill has between the two edges, kept off both so the outline stays a hairline. */
  const fillInnerR = $derived(innerR + OUTLINE_WIDTH / 2 + FILL_INSET);
  const fillOuterR = $derived(outerR - OUTLINE_WIDTH / 2 - FILL_INSET);

  /** The dial rises out of its outlines once, on mount, unless motion is unwelcome. */
  let grown = $state(0);
  $effect(() => {
    if (theme.reduceMotion) {
      grown = 1;
      return;
    }
    const id = requestAnimationFrame(() => (grown = 1));
    return () => cancelAnimationFrame(id);
  });

  const planned = $derived(segments.reduce((sum, s) => sum + s.plannedHours, 0) || 1);
  const tracked = $derived(segments.reduce((sum, s) => sum + (s.muted ? 0 : s.actualHours), 0));

  const slices = $derived.by(() => {
    let sum = 0;
    return segments.map((segment) => {
      const share = segment.plannedHours / planned;
      const start = sum / planned;
      sum += segment.plannedHours;

      const ratio = segment.plannedHours > 0 ? segment.actualHours / segment.plannedHours : 0;
      const over = !segment.muted && ratio > 1;
      return {
        segment,
        ratio,
        over,
        color: over ? "var(--danger)" : segment.color,
        start: start + GAP_FRACTION / 2,
        sweep: Math.max(0, share - GAP_FRACTION),
        fill: Math.min(1, Math.max(0, ratio)),
      };
    });
  });

  const shown = $derived(focused === null ? null : slices[focused]);
  const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

  const describe = (slice: (typeof slices)[number]) =>
    `${slice.segment.name}: ${formatHoursDecimal(slice.segment.actualHours)} of ${formatHoursDecimal(
      slice.segment.plannedHours,
    )} planned, ${percent(slice.ratio)}`;
</script>

<div class="relative" role="group" aria-label={label} style="width:{size}px;height:{size}px">
  <svg width={size} height={size}>
    <circle cx={c} cy={c} {r} fill="none" stroke="var(--surface-alt)" stroke-width={thickness} />

    {#each slices as slice, i (slice.segment.id)}
      {@const dim = focused !== null && focused !== i}
      <g opacity={dim ? 0.4 : 1} class="transition-opacity duration-150">
        <!-- The empty segment: its whole share of the week, drawn as nothing but its own edge. -->
        <path
          d={segmentOutline(c, c, outerR, innerR, slice.start, slice.sweep)}
          fill="none"
          stroke={slice.color}
          stroke-width={OUTLINE_WIDTH}
          stroke-opacity={slice.segment.muted ? 0.5 : 0.85}
          stroke-linejoin="round"
        />
        <!--
          And the hours that landed in it: the same wedge, thickening from the inner edge outward.
          Drawn as a stroked arc rather than a filled wedge because a stroke's radius and width are
          both animatable, which is what lets the band rise on mount instead of appearing.
        -->
        {#if slice.fill > 0}
          {@const depth = (fillOuterR - fillInnerR) * slice.fill * grown}
          {@const fr = fillInnerR + depth / 2}
          {@const circumference = 2 * Math.PI * fr}
          <circle
            cx={c}
            cy={c}
            r={fr}
            fill="none"
            stroke={slice.color}
            stroke-width={Math.max(0.001, depth)}
            stroke-opacity={slice.segment.muted ? 0.45 : 0.92}
            stroke-dasharray="{slice.sweep * circumference} {circumference}"
            stroke-dashoffset={-slice.start * circumference}
            transform="rotate(-90 {c} {c})"
            style={theme.reduceMotion
              ? undefined
              : "transition: r 620ms ease {i * 55}ms, stroke-width 620ms ease {i * 55}ms"}
          />
        {/if}
      </g>
    {/each}

    <!--
      One transparent band per segment, laid over the paint, so a segment can be pointed at or
      tabbed to and still be exactly the wedge it looks like rather than a box around it.
    -->
    {#each slices as slice, i (`hit-${slice.segment.id}`)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <path
        d={segmentOutline(c, c, outerR, innerR, slice.start, slice.sweep)}
        fill="transparent"
        role="img"
        tabindex="0"
        aria-label={describe(slice)}
        class="cursor-default outline-none"
        onpointerenter={() => (focused = i)}
        onpointerleave={() => focused === i && (focused = null)}
        onfocus={() => (focused = i)}
        onblur={() => focused === i && (focused = null)}
      />
    {/each}
  </svg>

  <!--
    Each segment wears its category's icon at its own middle. White once the fill has reached that
    far, the category's colour while the band there is still empty — one rule, and the icon stays
    legible on either ground.
  -->
  {#each slices as slice, i (`icon-${slice.segment.id}`)}
    {#if slice.sweep >= MIN_ICON_FRACTION}
      {@const pos = pointOnRing(c, c, r, slice.start + slice.sweep / 2)}
      {@const iconSize = Math.min(16, Math.round(thickness * 0.6))}
      {@const Icon = iconFor(slice.segment.icon)}
      <span
        class="pointer-events-none absolute flex items-center justify-center transition-opacity duration-150"
        aria-hidden="true"
        style="left:{pos.x - iconSize / 2}px;top:{pos.y - iconSize / 2}px;color:{slice.fill >= 0.5
          ? '#fff'
          : slice.color};opacity:{focused !== null && focused !== i ? 0.4 : 0.95}"
      >
        <Icon size={iconSize} strokeWidth={2.25} />
      </span>
    {/if}
  {/each}

  <!-- The middle answers whatever is being pointed at, and the week's total when nothing is. -->
  <div
    class="pointer-events-none absolute inset-y-0 flex flex-col items-center justify-center gap-0.5"
    style="left:{thickness + 6}px;right:{thickness + 6}px"
  >
    {#if shown}
      <span class="t-data-strong truncate" style="color:{shown.over ? 'var(--danger)' : undefined}">
        {formatHoursDecimal(shown.segment.actualHours)}
        <span class="text-fg-muted">/ {formatHoursDecimal(shown.segment.plannedHours)}</span>
      </span>
      <span class="t-micro w-full truncate text-center text-fg-muted">
        {shown.segment.name} · {percent(shown.ratio)}
      </span>
    {:else}
      <span class="t-data-strong truncate">{formatHoursDecimal(tracked)}</span>
      <span class="t-micro w-full truncate text-center text-fg-muted">tracked</span>
    {/if}
  </div>
</div>
