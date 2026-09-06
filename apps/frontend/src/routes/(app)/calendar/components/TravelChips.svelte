<script lang="ts">
  import { formatHoursAndMinutes } from "$lib/ui/format";
  import type { TravelMode } from "$lib/account/preferences-types";
  import { travelTimes } from "$lib/travel/times.svelte";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { Bike, Bus, Car, Footprints } from "lucide-svelte";

  /**
   * How long it takes to get to an event, one chip per way of going. The same answer the reminder
   * card and the grid show, read from the one store that asked — the server holds the maps key,
   * so a journey is a request, and it's only worth making once something is on screen about it.
   *
   * Where the journey starts is the event's own answer — a named place or the device's position —
   * so the chips change the moment the picker beside them does.
   */
  let { event, onopen }: { event: CalendarEvent; onopen: (url: string) => void } = $props();

  const MODE_ICONS: Record<TravelMode, typeof Bus> = {
    transit: Bus,
    drive: Car,
    bicycle: Bike,
    walk: Footprints,
  };

  // Asked on the store, which remembers the answer for the band on the grid and the reminder too;
  // the origin picker beside these changes the question, and the store answers the new one.
  $effect(() => {
    travelTimes.ensure(event);
  });
  const legs = $derived(travelTimes.legsFor(event) ?? []);
</script>

{#if legs.length > 0}
  <div class="flex flex-wrap items-center gap-2">
    {#each legs as leg (leg.mode)}
      {@const ModeIcon = MODE_ICONS[leg.mode]}
      <button
        type="button"
        class="chip-bare press-sm py-1"
        onclick={() => onopen(leg.url)}
      >
        <ModeIcon size={13} class="text-fg-muted" />
        <span class="t-data-micro">{formatHoursAndMinutes(leg.seconds / 3600)}</span>
      </button>
    {/each}
  </div>
{/if}
