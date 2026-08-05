<script lang="ts">
  import type { RingSegment } from "$lib/types";
  import Arc, { pointOnRing, RING_START } from "./Arc.svelte";

  const GAP_FRACTION = 0.004;
  const MIN_SPLIT_FRACTION = 0.055;

  /**
   * The week as a dial: one ring holding every hour you have, cut into the slices
   * you mean to spend. Drag a seam to move hours between neighbours, tap ✛ to cut
   * a new slice out of one you already have.
   */
  let {
    segments,
    onchange,
    onsplit,
    size = 232,
    thickness = 26,
    unit = "h",
    centerLabel,
    centerValue,
  }: {
    segments: RingSegment[];
    onchange: (values: number[]) => void;
    onsplit?: (index: number) => void;
    size?: number;
    thickness?: number;
    unit?: string;
    centerLabel?: string;
    centerValue?: string;
  } = $props();

  let container = $state<HTMLElement>();
  let dragging = $state<number | null>(null);

  const c = $derived(size / 2);
  const r = $derived(size / 2 - thickness / 2);
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

    const lower = index === 0 ? 0 : bounds[index - 1];
    const upper = bounds[index + 1];
    const clamped = Math.min(Math.max(value, lower), upper);

    const next = segments.map((s) => s.value);
    next[index] = round(clamped - lower);
    next[index + 1] = round(upper - clamped);
    onchange(next);
  }

  function startDrag(index: number, event: PointerEvent) {
    event.preventDefault();
    dragging = index;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
</script>

<div bind:this={container} class="relative touch-none" style="width:{size}px;height:{size}px">
  <svg width={size} height={size} aria-hidden="true">
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

  {#if onsplit}
    {#each segments as segment, i (`split-${segment.id}`)}
      {#if segment.value / total >= MIN_SPLIT_FRACTION}
        {@const pos = pointOnRing(c, c, r, (bounds[i] - segment.value / 2) / total)}
        <button
          type="button"
          aria-label="Split {segment.label || 'slice'}"
          onclick={() => onsplit?.(i)}
          class="press-sm absolute flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface"
          style="left:{pos.x - 12}px;top:{pos.y - 12}px"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1.5 6h9M6 1.5v9" stroke="var(--fg)" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
      {/if}
    {/each}
  {/if}

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
