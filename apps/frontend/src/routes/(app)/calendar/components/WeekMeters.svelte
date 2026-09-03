<script lang="ts">
  import CategoryDial, { type DialSegment } from "./CategoryDial.svelte";
  import type { CalendarEvent, Category } from "$lib/types";
  import { weekTotals } from "$lib/calendar/week-totals";

  /**
   * What the week is actually shaping up to be, against what it was planned to be — one dial in
   * the rail, each category a segment as wide as the hours it was promised. Computed from the
   * blocks on screen rather than fetched, so remapping an event fills the segment at once.
   */
  let {
    events,
    categories,
    weekStart,
  }: { events: readonly CalendarEvent[]; categories: readonly Category[]; weekStart: Date } = $props();

  /** The largest the dial gets; below that it takes whatever the rail can spare. */
  const MAX_SIZE = 180;
  const MIN_SIZE = 132;

  let width = $state(0);

  const buffers = $derived(new Set(categories.filter((c) => c.isBuffer).map((c) => c.id)));

  const segments = $derived<DialSegment[]>(
    weekTotals(events, categories, weekStart)
      .filter((c) => c.plannedHours > 0)
      .map((c) => ({ ...c, muted: buffers.has(c.id) })),
  );

  const size = $derived(Math.max(MIN_SIZE, Math.min(MAX_SIZE, width || MAX_SIZE)));
</script>

<div bind:clientWidth={width} class="flex justify-center">
  {#if segments.length}
    <CategoryDial {segments} {size} thickness={size >= 160 ? 32 : 26} />
  {/if}
</div>
