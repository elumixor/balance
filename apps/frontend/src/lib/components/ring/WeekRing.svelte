<script lang="ts" module>
  /** Below this a slice is a sliver: an icon in it would touch both seams. */
  export const MIN_ICON_FRACTION = 0.045;

  export const ringRadius = (size: number, thickness: number) => size / 2 - thickness / 2;
</script>

<script lang="ts">
  import { iconFor } from "$lib/ui/icons";
  import type { RingSegment } from "./types";
  import type { Snippet } from "svelte";
  import Arc, { pointOnRing, RING_START } from "./Arc.svelte";

  const GAP_FRACTION = 0.004;

  /**
   * The week as a dial: one ring holding every hour you have, cut into the slices
   * you mean to spend. Drag a seam to move hours between neighbours; what a slice
   * itself can be asked to do is a menu on the slice — right-click, or a long press.
   */
  let {
    segments,
    onchange,
    onmenu,
    size = 232,
    thickness = 26,
    unit = "h",
    centerLabel,
    centerValue,
    iconAt,
  }: {
    segments: RingSegment[];
    onchange: (values: number[]) => void;
    /** Asked for on a slice, at the point on screen it was asked from. */
    onmenu?: (index: number, at: DOMRect) => void;
    size?: number;
    thickness?: number;
    unit?: string;
    centerLabel?: string;
    centerValue?: string;
    /** Takes over the icon a slice wears, so the slice itself can be the thing you tap. */
    iconAt?: Snippet<[RingSegment, number, number]>;
  } = $props();

  let container = $state<HTMLElement>();
  let dragging = $state<number | null>(null);

  const c = $derived(size / 2);
  const r = $derived(ringRadius(size, thickness));
  const total = $derived(segments.reduce((sum, s) => sum + s.value, 0) || 1);

  /** Running sums: `bounds[i]` is where segment `i` ends, in segment units. */
  const bounds = $derived.by(() => {
    let sum = 0;
    return segments.map((s) => (sum += s.value));
  });

  const focused = $derived(dragging !== null ? segments[dragging] : null);
  const round = (value: number) => Math.round(value * 10) / 10;

  function moveSeam(index: number, clientX: number, clientY: number) {
    const rect = container?.getBoundingClientRect();
    if (!rect) return;

    const deg = (Math.atan2(clientY - rect.top - c, clientX - rect.left - c) * 180) / Math.PI;
    const raw = (((deg - RING_START + 360) % 360) / 360) * total;

    // The pointer's angle is modular: pick the wrap that sits nearest this seam.
    const reference = bounds[index];
    let value = raw;
    while (value - reference > total / 2) value -= total;
    while (value - reference < -total / 2) value += total;

    // Dragging a seam grows or shrinks the slice before it. Everything between it and the
    // buffer keeps its own size — only the buffer, last in `segments`, takes up the slack.
    const bufferIndex = segments.length - 1;
    const lower = index === 0 ? 0 : bounds[index - 1];
    const oldValue = segments[index].value;
    const bufferValue = segments[bufferIndex].value;
    const upper = lower + oldValue + bufferValue;
    const clamped = Math.min(Math.max(value, lower), upper);

    const newValue = round(clamped - lower);
    const next = segments.map((s) => s.value);
    next[index] = newValue;
    next[bufferIndex] = round(bufferValue - (newValue - oldValue));
    onchange(next);
  }

  function startDrag(index: number, event: PointerEvent) {
    event.preventDefault();
    dragging = index;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
</script>

<div bind:this={container} class="relative touch-none" style="width:{size}px;height:{size}px">
  <!-- Paint, unless the slices answer for themselves — then they're controls and have to be read. -->
  <svg width={size} height={size} aria-hidden={onmenu ? undefined : "true"}>
    <circle cx={c} cy={c} {r} fill="none" stroke="var(--surface-alt)" stroke-width={thickness} />
    {#each segments as segment, i (segment.id)}
      <Arc
        cx={c}
        cy={c}
        {r}
        {thickness}
        color={segment.color}
        start={(bounds[i] - segment.value) / total + GAP_FRACTION / 2}
        sweep={segment.value / total - GAP_FRACTION}
        opacity={dragging === null || dragging === i || dragging + 1 === i ? 1 : 0.45}
        animate={dragging === null}
        delay={i * 55}
        label="{segment.label || 'Untitled'} slice"
        onmenu={onmenu ? (at) => onmenu(i, at) : undefined}
      />
    {/each}
  </svg>

  <div
    class="pointer-events-none absolute inset-y-0 flex flex-col items-center justify-center gap-0.5"
    style="left:{thickness + 8}px;right:{thickness + 8}px"
  >
    <span class="t-data-strong truncate">
      {focused ? `${round(focused.value)}${unit}` : (centerValue ?? `${round(total)}${unit}`)}
    </span>
    <span class="t-micro truncate text-center text-fg-muted">
      {focused ? focused.label || "Untitled" : (centerLabel ?? "planned")}
    </span>
  </div>

  <!--
    Each slice wears its category's icon, so the ring can be read without the list beside it. It
    sits in the band, in white: every palette colour is mid-dark, and one rule beats per-colour
    guesswork at keeping the icon legible.
  -->
  {#each segments as segment, i (`icon-${segment.id}`)}
    {#if segment.icon && segment.value / total >= MIN_ICON_FRACTION}
      {@const pos = pointOnRing(c, c, r, (bounds[i] - segment.value / 2) / total)}
      {@const iconSize = Math.min(18, Math.round(thickness * 0.62))}
      <span
        class="absolute flex items-center justify-center text-white transition-opacity duration-150 {iconAt
          ? ''
          : 'pointer-events-none'}"
        aria-hidden={iconAt ? undefined : "true"}
        style="left:{pos.x - (iconSize + 10) / 2}px;top:{pos.y - (iconSize + 10) / 2}px;width:{iconSize +
          10}px;height:{iconSize + 10}px;opacity:{dragging === null || dragging === i || dragging + 1 === i
          ? 0.95
          : 0.4}"
      >
        {#if iconAt}
          {@render iconAt(segment, i, iconSize)}
        {:else}
          {@const Icon = iconFor(segment.icon)}
          <Icon size={iconSize} strokeWidth={2.25} />
        {/if}
      </span>
    {/if}
  {/each}

  <!-- The draggable divider between two neighbouring ring slices. -->
  {#each segments.slice(0, -1) as _, i (`seam-${i}`)}
    {@const pos = pointOnRing(c, c, r, bounds[i] / total)}
    <div
      role="slider"
      tabindex="0"
      aria-label="Move hours between neighbouring slices"
      aria-valuenow={round(segments[i].value)}
      aria-valuemin={0}
      aria-valuemax={round(total)}
      class="absolute flex size-9 cursor-grab touch-none items-center justify-center"
      style="left:{pos.x - 18}px;top:{pos.y - 18}px;transform:rotate({(bounds[i] / total) * 360}deg)"
      onpointerdown={(e) => startDrag(i, e)}
      onpointermove={(e) => dragging === i && moveSeam(i, e.clientX, e.clientY)}
      onpointerup={() => (dragging = null)}
      onpointercancel={() => (dragging = null)}
    >
      <div
        class="rounded-full border-[1.5px] border-surface bg-ink"
        style="width:{dragging === i ? 6 : 4}px;height:{thickness + 12}px"
      ></div>
    </div>
  {/each}
</div>
