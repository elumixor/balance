<script lang="ts">
  import { categories } from "$lib/core/synced.svelte";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { CalendarsSection } from "$lib/calendar/components";
  import MonthGrid from "./MonthGrid.svelte";
  import ProjectMeters from "./ProjectMeters.svelte";
  import ProjectsPalette from "./ProjectsPalette.svelte";
  import WeekMeters from "./WeekMeters.svelte";

  /**
   * Everything the calendar screen needs beside itself: which of the connected accounts'
   * calendars are drawn, where in the year the grid is, and how the week is filling up against
   * its targets. It lives in the rail so the grid keeps the whole window, and in a popover on a
   * phone, where there is no rail.
   */
  const data = calendarData;

  const plan = $derived(categories.all);
</script>

<div class="space-y-6">
  {#if data.connected}
    <MonthGrid />
    <section class="space-y-4">
      <WeekMeters events={data.eventsForTotals} categories={plan} weekStart={data.weekStart} />
      <ProjectMeters events={data.eventsForTotals} categories={plan} weekStart={data.weekStart} />
    </section>
    <!-- The rail's palette: drag a project, or one of its tasks, onto the week. -->
    <section>
      <ProjectsPalette categories={plan} />
    </section>
  {/if}

  <CalendarsSection />
</div>
