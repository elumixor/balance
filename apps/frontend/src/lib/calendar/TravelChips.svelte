<script lang="ts">
  import { formatHoursAndMinutes } from "$lib/format";
  import { preferences, type TravelMode } from "$lib/preferences.svelte";
  import { getTravelTimes, type TravelLeg } from "$lib/travel";
  import { Bike, Bus, Car, Footprints } from "lucide-svelte";

  /**
   * How long it takes to get to an event, one chip per way of going. The same answer the reminder
   * card shows, asked here because the editor is open on something with an address in it — the
   * server holds the maps key, so this is a request, and it's only worth making once the card is
   * actually on screen.
   */
  let {
    destination,
    arriveBy,
    onopen,
  }: {
    destination: string;
    arriveBy: string;
    onopen: (url: string) => void;
  } = $props();

  const MODE_ICONS: Record<TravelMode, typeof Bus> = {
    transit: Bus,
    drive: Car,
    bicycle: Bike,
    walk: Footprints,
  };

  let legs = $state<TravelLeg[]>([]);
  /** What has already been asked, so re-rendering the card doesn't ask the same journey again. */
  let asked = "";

  $effect(() => {
    const origin = preferences.travel.origin;
    const modes = preferences.travel.modes;
    const key = `${origin}|${destination}|${arriveBy}|${modes.join(",")}`;
    if (!origin || modes.length === 0 || asked === key) return;
    asked = key;

    let live = true;
    void getTravelTimes({ origin, destination, modes: [...modes], arriveBy })
      .then((answer) => {
        if (live) legs = answer.available ? answer.legs : [];
      })
      .catch(() => {
        // No answer is the same as no maps key here: the row simply says nothing about travel.
        if (live) legs = [];
      });
    return () => (live = false);
  });
</script>

{#if legs.length > 0}
  <div class="flex flex-wrap items-center gap-2">
    {#each legs as leg (leg.mode)}
      {@const ModeIcon = MODE_ICONS[leg.mode]}
      <button
        type="button"
        class="press-sm flex items-center gap-1.5 rounded-md border border-line px-2 py-1"
        onclick={() => onopen(leg.url)}
      >
        <ModeIcon size={13} class="text-fg-muted" />
        <span class="t-data-micro">{formatHoursAndMinutes(leg.seconds / 3600)}</span>
      </button>
    {/each}
  </div>
{/if}
