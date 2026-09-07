<script lang="ts">
  import { AddressField, Button, Field, MapPreview, Popover, PopoverItem } from "$lib/components";
  import { iconFor, PLACE_ICON } from "$lib/ui/icons";
  import type { PlaceDetails } from "$lib/travel/places";
  import { preferences } from "$lib/account/preferences.svelte";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { CALENDAR, HERE, type OriginChoice, travelOrigin } from "$lib/travel/origin.svelte";
  import { CalendarCheck, LocateFixed, Plus } from "lucide-svelte";

  /**
   * Where this event's journey starts.
   *
   * One saved address can't answer it: the gym is not left from the office, and on a Saturday you
   * are at neither. So the choice is per event and it sits on the event, next to the journeys it
   * changes — not three screens away in settings, which is where you would have to have guessed
   * the answer before opening this card. Until somebody chooses, the calendar answers: the
   * meeting that just ended across town, the trip you are on, or the usual place.
   *
   * A place can be added from inside the picker, because the moment you notice the list is
   * missing one is the moment you are looking at an event that leaves from it.
   */
  let { event }: { event: CalendarEvent } = $props();

  const eventId = $derived(event.id);
  const choice = $derived(travelOrigin.choiceFor(eventId));
  const locations = $derived(preferences.travel.locations);
  const label = $derived(travelOrigin.labelFor(choice, event, calendarData.events));
  /** What following the calendar would mean right now, named so the choice is a real one. */
  const followedLabel = $derived(travelOrigin.labelFor(CALENDAR, event, calendarData.events));

  let adding = $state(false);
  let address = $state("");
  let name = $state("");
  /** Google's own pin for the address, once the map has looked it up. */
  let pinned = $state<PlaceDetails | null>(null);
  /** The text that pin was looked up for, so a since-retyped address is saved without it. */
  let pinnedFor = $state("");

  function select(next: OriginChoice, close: () => void) {
    travelOrigin.choose(eventId, next);
    close();
  }

  function startAdding() {
    adding = true;
    address = "";
    name = "";
    pinned = null;
    pinnedFor = "";
  }

  /** Added and chosen in one gesture: the place was named in order to leave from it. */
  function saveAdded(close: () => void) {
    if (!name.trim() || !address.trim()) return;
    const pin = pinnedFor === address.trim() ? pinned : null;
    const id = preferences.addLocation({
      label: name,
      address,
      placeId: pin?.placeId ?? null,
      latitude: pin?.latitude,
      longitude: pin?.longitude,
    });
    travelOrigin.choose(eventId, { kind: "saved", id });
    adding = false;
    close();
  }
</script>

<Popover width={260} align="start">
  {#snippet trigger(open)}
    <button
      type="button"
      onclick={open}
      aria-label="Where this journey starts"
      class="chip-bare press-sm py-1"
    >
      {#if choice.kind === "here"}
        <LocateFixed size={13} class="text-fg-muted" />
      {:else if choice.kind === "calendar"}
        <CalendarCheck size={13} class="text-fg-muted" />
      {:else}
        {@const Chosen = iconFor(preferences.location(choice.id)?.icon ?? PLACE_ICON)}
        <Chosen size={13} class="text-fg-muted" />
      {/if}
      <span class="t-micro text-fg-muted">from {label}</span>
    </button>
  {/snippet}

  {#snippet content(close)}
    {#if adding}
      <div class="space-y-2 p-2">
        <AddressField
          bind:value={address}
          ariaLabel="Address of this place"
          autofocus
          onpick={(suggestion) => {
            if (!name.trim()) name = suggestion.name;
          }}
          oncommit={() => saveAdded(close)}
        />
        <MapPreview
          {address}
          onplace={(place, query) => {
            pinned = place;
            pinnedFor = query;
          }}
        />
        <Field bind:value={name} placeholder="Home, Office" ariaLabel="Name of this place" autocapitalize="sentences" />
        <div class="flex items-center gap-2">
          <Button label="Save and use it" size="sm" full disabled={!name.trim() || !address.trim()} onclick={() => saveAdded(close)} />
          <Button label="Cancel" variant="bare" onclick={() => (adding = false)} />
        </div>
      </div>
    {:else}
      <PopoverItem
        label="Follow the calendar · {followedLabel}"
        selected={choice.kind === "calendar"}
        onclick={() => select(CALENDAR, close)}
      >
        {#snippet icon()}<CalendarCheck size={15} class="text-fg-muted" />{/snippet}
      </PopoverItem>
      <PopoverItem
        label="Where I am"
        selected={choice.kind === "here"}
        onclick={() => select(HERE, close)}
      >
        {#snippet icon()}<LocateFixed size={15} class="text-fg-muted" />{/snippet}
      </PopoverItem>
      {#each locations as location (location.id)}
        {@const Glyph = iconFor(location.icon ?? PLACE_ICON)}
        <PopoverItem
          label={location.label}
          selected={choice.kind === "saved" && choice.id === location.id}
          onclick={() => select({ kind: "saved", id: location.id }, close)}
        >
          {#snippet icon()}<Glyph size={15} class="text-fg-muted" />{/snippet}
        </PopoverItem>
      {/each}
      <PopoverItem label="Add a place" onclick={startAdding}>
        {#snippet icon()}<Plus size={15} class="text-fg-muted" />{/snippet}
      </PopoverItem>
    {/if}
  {/snippet}
</Popover>
