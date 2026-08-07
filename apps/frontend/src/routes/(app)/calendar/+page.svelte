<script lang="ts">
  import ActivityPalette from "$lib/calendar/ActivityPalette.svelte";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import CalendarPicker from "$lib/calendar/CalendarPicker.svelte";
  import ConnectCard from "$lib/calendar/ConnectCard.svelte";
  import EventSheet from "$lib/calendar/EventSheet.svelte";
  import WeekGrid from "$lib/calendar/WeekGrid.svelte";
  import WeekHeader from "$lib/calendar/WeekHeader.svelte";
  import IconButton from "$lib/components/IconButton.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Screen from "$lib/components/Screen.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import { addDays, DAYS_PER_WEEK } from "$lib/dates";
  import { store } from "$lib/store.svelte";
  import { ChevronLeft, ChevronRight } from "lucide-svelte";

  const data = calendarData;
  void data.enter();

  const categories = $derived(store.categories.value ?? []);
  const categoryById = $derived(new Map(categories.map((c) => [c.id, c])));
  const activities = $derived(store.activities.value ?? []);
  const week = $derived(data.week);

  const rangeLabel = $derived.by(() => {
    const end = addDays(data.weekStart, DAYS_PER_WEEK - 1);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${data.weekStart.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  });
</script>

<Screen title="Calendar" subtitle={rangeLabel} wide>
  <div class="mb-4 flex items-center gap-2">
    <IconButton label="Previous week" onclick={() => data.goToWeek(-1)}><ChevronLeft size={16} /></IconButton>
    <IconButton label="Next week" onclick={() => data.goToWeek(1)}><ChevronRight size={16} /></IconButton>
    {#if !data.isThisWeek}
      <button type="button" class="t-label press-sm rounded-md px-2 py-1 text-fg-muted" onclick={() => data.goToToday()}>
        This week
      </button>
    {/if}
    <div class="flex-1"></div>
    {#if data.connected}<CalendarPicker />{/if}
  </div>

  {#if data.actionError}
    <div class="mb-3"><InlineError message={data.actionError} /></div>
  {/if}

  {#if week.error && !week.hasValue}
    <LoadError message={week.error} onretry={() => void week.refresh()} />
  {:else if !week.hasValue}
    <Skeleton height={384} radius={10} />
  {:else if !data.connected}
    <ConnectCard needsReconnect={data.needsReconnect} />
  {:else}
    <div class="space-y-5">
      <WeekHeader events={data.events} {categories} weekStart={data.weekStart} />
      <div class="xl:grid xl:grid-cols-[minmax(0,220px)_minmax(0,1fr)] xl:items-start xl:gap-6">
        <ActivityPalette {activities} categories={categoryById} />
        <div class="mt-4 min-w-0 xl:mt-0">
          <WeekGrid categories={categoryById} />
        </div>
      </div>
    </div>
  {/if}
</Screen>

{#if data.selected}
  <!-- Keyed so opening a second event starts from that event's mapping, not the last one's. -->
  {#key data.selected.id}
    <EventSheet event={data.selected} {activities} {categories} />
  {/key}
{/if}
