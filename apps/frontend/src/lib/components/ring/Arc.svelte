<script lang="ts" module>
  export const RING_START = -90;

  export function pointOnRing(cx: number, cy: number, r: number, frac: number) {
    const angle = ((RING_START + frac * 360) * Math.PI) / 180;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }
</script>

<script lang="ts">
  import { theme } from "$lib/theme.svelte";

  let {
    cx,
    cy,
    /** Radius of the arc's centre line. */
    r,
    thickness,
    color,
    /** Both are fractions of the full circle, measured clockwise from 12 o'clock. */
    start,
    sweep,
    opacity = 1,
    /** Sweeps open on mount; skipped while dragging so the ring tracks the finger. */
    animate = true,
    delay = 0,
  }: {
    cx: number;
    cy: number;
    r: number;
    thickness: number;
    color: string;
    start: number;
    sweep: number;
    opacity?: number;
    animate?: boolean;
    delay?: number;
  } = $props();

  const shouldAnimate = $derived(animate && !theme.reduceMotion);
  const circumference = $derived(2 * Math.PI * r);

  let grown = $state(0);
  $effect(() => {
    if (!shouldAnimate) {
      grown = 1;
      return;
    }
    const id = setTimeout(() => (grown = 1), delay);
    return () => clearTimeout(id);
  });

  const length = $derived(Math.max(0, sweep) * circumference * grown);
</script>

{#if sweep > 0}
  <circle
    {cx}
    {cy}
    {r}
    fill="none"
    stroke={color}
    stroke-width={thickness}
    stroke-opacity={opacity}
    stroke-dasharray="{length} {circumference - length}"
    stroke-dashoffset={-start * circumference}
    transform="rotate(-90 {cx} {cy})"
    style={shouldAnimate ? "transition: stroke-dasharray 620ms ease" : ""}
  />
{/if}
