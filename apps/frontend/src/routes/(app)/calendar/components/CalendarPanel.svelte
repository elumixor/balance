<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { CalendarsSection } from "$lib/calendar/components";
  import MonthGrid from "./MonthGrid.svelte";

  /**
   * Everything the calendar screen needs beside itself: where in the year the grid is, and which
   * of the connected accounts' calendars are drawn. The month stays put; only the calendars scroll,
   * and only once there are more of them than the rail has room for. It lives in the rail so the
   * grid keeps the whole window, and in a popover on a phone, where there is no rail.
   */
  const data = calendarData;
</script>

<div class="flex h-full min-h-0 flex-col gap-6">
  {#if data.connected}
    <div class="shrink-0"><MonthGrid /></div>
  {/if}

  <div class="min-h-0 flex-1 overflow-y-auto pb-6">
    <CalendarsSection />
  </div>
</div>
