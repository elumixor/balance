<script lang="ts">
  import { preferences } from "$lib/account/preferences.svelte";
  import { offsetMinutes, shortZoneName } from "$lib/calendar/time-zones";
  import { gutterTicks } from "$lib/calendar/week-grid";
  import { deviceTimeZone } from "$lib/planning/zone";
  import { viewport } from "$lib/platform/viewport.svelte";
  import { Minus, Plus } from "lucide-svelte";
  import TimeZonePicker from "./TimeZonePicker.svelte";

  /**
   * The hours, down the left of the grid — a column of them per zone, staying put while the days
   * slide past. Tapping a column's name opens the picker for that zone, which is also where a
   * column is added beside it or taken away.
   */
  let {
    hourPx,
    headerPx,
    columnPx,
    zoneAt,
  }: {
    hourPx: number;
    /** The header the day headings and banners take, so the hours start level with the grid. */
    headerPx: number;
    /** One column's width — the grid works it out, since it is what the days' width is left after. */
    columnPx: number;
    /** The moment the columns are read at, since the gap between two zones moves with the clocks. */
    zoneAt: Date;
  } = $props();

  /** How many zones the grid will name its hours in — past this the days have no room left. */
  const MAX_ZONE_COLUMNS = 5;
  const zoneColumns = $derived(preferences.zoneColumns);
  /**
   * The hours' columns, one per zone, each naming as many of the rules behind the grid as there is
   * room for — the same ticks, read on another clock.
   */
  const zoneTicks = $derived(
    zoneColumns.map((zone) => ({
      zone,
      // A zone this account has named wears that name; any other, the shortest the runtime has.
      label: preferences.zoneNamed(zone)?.label ?? shortZoneName(zone, zoneAt),
      ticks: gutterTicks(hourPx, offsetMinutes(zone, zoneAt) - offsetMinutes(deviceTimeZone(), zoneAt)),
    })),
  );
  /** Which column's zone is being picked, and where the picker hangs. */
  let zonePick = $state<{ index: number; rect: DOMRect } | null>(null);

  function chooseZone(zone: string) {
    if (!zonePick) return;
    preferences.setZoneColumns(zoneColumns.map((one, index) => (index === zonePick?.index ? zone : one)));
    zonePick = null;
  }

  function addZoneColumn() {
    if (!zonePick) return;
    const index = zonePick.index + 1;
    preferences.setZoneColumns([...zoneColumns.slice(0, index), zoneColumns[zonePick.index], ...zoneColumns.slice(index)]);
    zonePick = { index, rect: zonePick.rect };
  }

  function removeZoneColumn() {
    if (!zonePick) return;
    preferences.setZoneColumns(zoneColumns.filter((_, index) => index !== zonePick?.index));
    zonePick = null;
  }
</script>

<div class="sticky left-0 z-30 flex shrink-0 border-line border-r bg-surface" style="width:{columnPx * zoneColumns.length}px">
  {#each zoneTicks as column, index (index)}
    <div class="flex shrink-0 flex-col {index > 0 ? 'border-line border-l' : ''}" style="width:{columnPx}px">
      <div
        class="sticky top-0 z-10 flex shrink-0 items-end justify-center border-line border-b bg-surface pb-0.5 transition-[height] duration-150"
        style="height:{headerPx}px"
      >
        <!-- A rung smaller on a phone, where the gutter is narrower than the label it carries. -->
        <button
          type="button"
          title={column.zone}
          aria-label="Time zone: {column.zone}"
          onclick={(e) => (zonePick = { index, rect: e.currentTarget.getBoundingClientRect() })}
          class="hoverable {viewport.md ? 't-data-micro' : 't-data-nano'} max-w-full truncate rounded-md px-1 {zonePick?.index === index
            ? 'text-fg'
            : 'text-fg-faint'}"
        >
          {column.label}
        </button>
      </div>
      <div class="relative" style="height:{24 * hourPx}px">
        {#each column.ticks as tick (tick.minutes)}
          <!-- A division between the hours is drawn quieter than they are, the same way its line is. -->
          <div
            class="absolute right-2 -translate-y-1/2 text-fg-faint {tick.major ? 't-data-micro' : 't-data-nano opacity-55'}"
            style="top:{(tick.minutes / 60) * hourPx}px"
          >
            {tick.label}
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

{#if zonePick}
  <TimeZonePicker
    rect={zonePick.rect}
    value={zoneColumns[zonePick.index]}
    at={zoneAt}
    onchoose={chooseZone}
    onclose={() => (zonePick = null)}
  >
    {#snippet footer()}
      {#if zoneColumns.length < MAX_ZONE_COLUMNS}
        <button type="button" onclick={addZoneColumn} class="menu-row">
          <Plus size={14} class="shrink-0 text-fg-faint" />
          <span>Add another zone</span>
        </button>
      {/if}
      {#if zoneColumns.length > 1}
        <button type="button" onclick={removeZoneColumn} class="menu-row">
          <Minus size={14} class="shrink-0 text-fg-faint" />
          <span>Remove this column</span>
        </button>
      {/if}
    {/snippet}
  </TimeZonePicker>
{/if}
