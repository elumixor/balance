<script lang="ts">
  import { store } from "$lib/store.svelte";
  import { calendarData } from "./calendar-data.svelte";
  import CalendarsSection from "./CalendarsSection.svelte";
  import MonthGrid from "./MonthGrid.svelte";
  import WeekMeters from "./WeekMeters.svelte";

  /**
   * Everything the calendar screen needs beside itself: which of the connected accounts'
   * calendars are drawn, where in the year the grid is, and how the week is filling up against
   * its targets. It lives in the rail so the grid keeps the whole window, and in a popover on a
   * phone, where there is no rail.
   */
  const data = calendarData;

  const categories = $derived(store.categories.value ?? []);
</script>

<div class="space-y-5">
  {#if data.connected}
    <MonthGrid />
  {/if}

  <br />

  {#if data.connected}
    <section>
      <WeekMeters events={data.eventsForTotals} {categories} weekStart={data.weekStart} />
    </section>
  {/if}

  <br>

  <CalendarsSection />

</div>
