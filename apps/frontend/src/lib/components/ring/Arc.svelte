<script lang="ts" module>
  export const RING_START = -90;

  export function pointOnRing(cx: number, cy: number, r: number, frac: number) {
    const angle = ((RING_START + frac * 360) * Math.PI) / 180;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }
</script>

<script lang="ts">
  import { theme } from "$lib/ui/theme.svelte";

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
    label,
    onmenu,
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
    /** What the slice is called, for the screen reader and for the menu it can open. */
    label?: string;
    /**
     * What this slice can be asked to do, at the point it was asked from: right-click, a long
     * press, or Enter on a focused slice. Given one, the arc becomes a control rather than paint.
     */
    onmenu?: (at: DOMRect) => void;
  } = $props();

  /** How long a finger has to stay put before a press means "what can this do?". */
  const LONG_PRESS_MS = 450;
  const MOVED_ENOUGH = 8;

  let arc = $state<SVGCircleElement>();
  let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;

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

  const at = (x: number, y: number) => new DOMRect(x, y, 0, 0);

  /** Where the slice itself is on screen — what a keyboard press has to point the menu at. */
  function middle() {
    const box = arc?.getBoundingClientRect();
    if (!box) return at(0, 0);
    const angle = ((RING_START + (start + sweep / 2) * 360) * Math.PI) / 180;
    return at(box.left + box.width / 2 + r * Math.cos(angle), box.top + box.height / 2 + r * Math.sin(angle));
  }

  function endPress() {
    if (press) clearTimeout(press.timer);
    press = null;
  }

  function startPress(event: PointerEvent) {
    if (event.pointerType === "mouse") return;
    endPress();
    const { clientX: x, clientY: y } = event;
    press = { x, y, timer: setTimeout(() => onmenu?.(at(x, y)), LONG_PRESS_MS) };
  }

  function movedPress(event: PointerEvent) {
    if (!press) return;
    const far = Math.abs(event.clientX - press.x) > MOVED_ENOUGH || Math.abs(event.clientY - press.y) > MOVED_ENOUGH;
    if (far) endPress();
  }
</script>

{#if sweep > 0}
  <!--
    Only the painted part of the stroke answers a pointer, so each slice hears the presses that
    landed on it and no others — the ring is one circle per slice, dashed down to its own sweep.
  -->
  <!-- The role is only ever missing when the handlers are too, which the compiler can't see. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <circle
    bind:this={arc}
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
    role={onmenu ? "button" : undefined}
    tabindex={onmenu ? 0 : undefined}
    aria-label={onmenu ? label : undefined}
    aria-haspopup={onmenu ? "menu" : undefined}
    oncontextmenu={onmenu
      ? (event) => {
          event.preventDefault();
          onmenu(at(event.clientX, event.clientY));
        }
      : undefined}
    onpointerdown={onmenu ? startPress : undefined}
    onpointermove={onmenu ? movedPress : undefined}
    onpointerup={onmenu ? endPress : undefined}
    onpointercancel={onmenu ? endPress : undefined}
    onkeydown={onmenu
      ? (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onmenu(middle());
        }
      : undefined}
  />
{/if}
