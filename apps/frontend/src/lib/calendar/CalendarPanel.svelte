<script lang="ts">
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import { store } from "$lib/store.svelte";
  import ActivityPalette from "./ActivityPalette.svelte";
  import { calendarData } from "./calendar-data.svelte";
  import CalendarsSection from "./CalendarsSection.svelte";
  import WeekMeters from "./WeekMeters.svelte";

  /**
   * Everything the calendar screen needs beside itself: which of the account's calendars are
   * drawn, which one new events land in, and the activities to drag onto the week. It lives in
   * the rail so the grid keeps the whole window, and in a popover on a phone, where there is
   * no rail.
   */
  const data = calendarData;

  const categories = $derived(store.categories.value ?? []);
  const activities = $derived(store.activities.value ?? []);
  const categoryById = $derived(new Map(categories.map((c) => [c.id, c])));
</script>

<div class="space-y-6">
  <section>
    <SectionHeader title="Calendars" />
    <CalendarsSection />
  </section>

  {#if data.connected}
    <section>
      <!-- The week changes by scrolling the grid sideways; this only offers the way back to today. -->
      <button
        type="button"
        onclick={() => data.goToToday()}
        class="t-heading press-sm rounded-md px-1.5 py-1 {data.isThisWeek ? 'text-danger' : 'text-fg-muted'}"
      >
        {data.monthLabel}
      </button>
      <div class="mt-3">
        <WeekMeters events={data.eventsForTotals} {categories} weekStart={data.weekStart} />
      </div>
    </section>
  {/if}

  {#if data.connected && activities.length > 0}
    <section>
      <SectionHeader title="Activities" />
      <ActivityPalette {activities} categories={categoryById} />
    </section>
  {/if}
</div>
