<script lang="ts">
  import { minutesIntoDay } from "$lib/calendar/dates";
  import { clock } from "$lib/platform/clock.svelte";

  /** The red line across today's column, at the minute it is now. */
  let { hourPx }: { hourPx: number } = $props();

  const nowTop = $derived((minutesIntoDay(clock.now) / 60) * hourPx);
</script>

<div class="pointer-events-none absolute inset-x-0 h-px bg-danger" style="top:{nowTop}px"></div>
