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
  /** The journey the chips on screen are about, so an answer that arrives late can be ignored. */
  let shown = $state("");

  $effect(() => {
    const origin = preferences.travel.origin;
    const modes = preferences.travel.modes;
    const key = `${origin}|${destination}|${arriveBy}|${modes.join(",")}`;
    // A preference that isn't part of the question — how early you like to be — still replaces
    // the whole preferences object, so the guard is on the journey rather than on having asked.
    if (!origin || modes.length === 0 || shown === key) return;
    // What's on screen is about a different journey, and a wrong number is worse than none.
    if (shown) legs = [];

    let live = true;
    void getTravelTimes({ origin, destination, modes: [...modes], arriveBy })
      .then((answer) => {
        if (!live) return;
        legs = answer.available ? answer.legs : [];
        shown = key;
      })
      .catch(() => {
        // No answer is the same as no maps key here: the row simply says nothing about travel.
        if (!live) return;
        legs = [];
        shown = key;
      });
    return () => {
      live = false;
    };
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
