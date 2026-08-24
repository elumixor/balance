<script lang="ts">
  import { formatHoursAndMinutes } from "$lib/format";
  import { preferences, type TravelMode } from "$lib/preferences.svelte";
  import { getTravelTimes, type TravelLeg } from "$lib/travel";
  import { travelOrigin } from "$lib/travel-origin.svelte";
  import { Bike, Bus, Car, Footprints } from "lucide-svelte";

  /**
   * How long it takes to get to an event, one chip per way of going. The same answer the reminder
   * card shows, asked here because the editor is open on something with an address in it — the
   * server holds the maps key, so this is a request, and it's only worth making once the card is
   * actually on screen.
   *
   * Where the journey starts is the event's own answer — a named place or the device's position —
   * so the chips change the moment the picker beside them does.
   */
  let {
    eventId,
    destination,
    arriveBy,
    onopen,
  }: {
    eventId: string;
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

  const choice = $derived(travelOrigin.choiceFor(eventId));

  $effect(() => {
    const modes = preferences.travel.modes;
    // The choice rather than the resolved origin: "where I am" is a promise of an address, and
    // waiting for the fix before deciding whether to ask would make this effect its own trigger.
    const from = choice.kind === "here" ? "here" : choice.id;
    const key = `${from}|${destination}|${arriveBy}|${modes.join(",")}`;
    if (modes.length === 0 || shown === key) return;
    // What's on screen is about a different journey, and a wrong number is worse than none.
    if (shown) legs = [];

    let live = true;
    void travelOrigin
      .resolve(choice)
      .then((origin) => {
        if (!live) return { available: false, legs: [] };
        // Nowhere to leave from: no named place, or the device wouldn't say where it is.
        if (!origin) return { available: false, legs: [] };
        return getTravelTimes({ origin, destination, modes: [...modes], arriveBy });
      })
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
