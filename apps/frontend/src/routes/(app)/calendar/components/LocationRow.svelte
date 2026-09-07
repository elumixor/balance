<script lang="ts">
  import { AddressField, CardRow, MapPreview } from "$lib/components";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { MapPin, MapPinCheckInside, X } from "lucide-svelte";
  import OriginPicker from "./OriginPicker.svelte";
  import TravelChips from "./TravelChips.svelte";

  /**
   * Where it is. Set, the address with the journeys to it; unset, a row that turns into the
   * address field on press. Pressing the address turns it back into the field, so a typo is put
   * right in place rather than by clearing and starting again.
   *
   * "Stay here" is the one word the travel planning needs from a person: that this event moves
   * them. A timed one puts them at its address from when it ends; an all-day one is a trip. It sits
   * beside the journey's own origin picker because it is the other half of the same question,
   * and it is a mapping of the app's own, so it works on an invitation you can't otherwise touch.
   */
  let {
    event,
    location,
    travelTo,
    editable,
    /** Whether the location is somewhere a person can be — an address or a city, not a link. */
    stayable,
    onchange,
    onstay,
    onopen,
  }: {
    event: CalendarEvent;
    location: string | null;
    /** The address journeys are worked out to, or null when the location is a room or a link. */
    travelTo: string | null;
    editable: boolean;
    stayable: boolean;
    onchange: (location: string) => void;
    onstay: (placeChange: boolean) => void;
    onopen: (url: string) => void;
  } = $props();

  const eventId = $derived(event.id);

  let editing = $state(false);
  let draft = $state("");

  function begin() {
    draft = location ?? "";
    editing = true;
  }

  function commit(value: string) {
    editing = false;
    if (value.trim() !== (location ?? "")) onchange(value.trim());
  }
</script>

{#if editing}
  <CardRow icon={MapPin}>
    <div class="min-w-0 flex-1">
      <AddressField
        bind:value={draft}
        ariaLabel="Where it is"
        autofocus
        variant="bare"
        onpick={(suggestion) => commit(suggestion.address)}
        oncommit={commit}
      />
    </div>
  </CardRow>
{:else if location}
  <CardRow icon={MapPin} set align="start">
    <div class="min-w-0 flex-1 space-y-1.5 py-1">
      <div class="flex items-start gap-1">
        {#if editable}
          <button type="button" onclick={begin} class="t-label min-w-0 flex-1 break-words text-left hover:text-fg">
            {location}
          </button>
          <button
            type="button"
            aria-label="Remove location"
            onclick={() => onchange("")}
            class="press-sm hoverable shrink-0 rounded-md p-1 text-fg-faint hover:text-fg"
          >
            <X size={14} />
          </button>
        {:else}
          <p class="t-label break-words">{location}</p>
        {/if}
      </div>
      {#if travelTo}
        <MapPreview address={travelTo} {onopen} />
      {/if}
      {#if travelTo || stayable}
        <div class="flex flex-wrap items-center gap-2">
          {#if travelTo}
            <OriginPicker {event} />
            <TravelChips {event} {onopen} />
          {/if}
          {#if stayable}
            <button
              type="button"
              aria-pressed={event.placeChange}
              title={event.allDay
                ? "Journeys during these days start from here"
                : "Journeys after this start from here, until the next move"}
              onclick={() => onstay(!event.placeChange)}
              class="chip-bare press-sm py-1 {event.placeChange ? '' : 'bg-transparent'}"
            >
              <MapPinCheckInside size={13} class={event.placeChange ? "text-fg" : "text-fg-faint"} />
              <span class="t-micro {event.placeChange ? 'text-fg' : 'text-fg-faint'}">
                {event.placeChange ? "Staying here" : "Stay here"}
              </span>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </CardRow>
{:else if editable}
  <CardRow icon={MapPin} label="Location" onclick={begin} />
{:else}
  <CardRow icon={MapPin} label="No location" />
{/if}
