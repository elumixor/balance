<script lang="ts">
  import AddressField from "$lib/components/AddressField.svelte";
  import { MapPin, X } from "lucide-svelte";
  import OriginPicker from "./OriginPicker.svelte";
  import TravelChips from "./TravelChips.svelte";

  /**
   * Where it is. Set, the address with the journeys to it; unset, a row that turns into the
   * address field on press. Pressing the address turns it back into the field, so a typo is put
   * right in place rather than by clearing and starting again.
   */
  let {
    eventId,
    location,
    travelTo,
    arriveBy,
    editable,
    onchange,
    onopen,
  }: {
    eventId: string;
    location: string | null;
    /** The address journeys are worked out to, or null when the location is a room or a link. */
    travelTo: string | null;
    arriveBy: string;
    editable: boolean;
    onchange: (location: string) => void;
    onopen: (url: string) => void;
  } = $props();

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
  <div class="flex w-full items-center gap-3 py-1.5">
    <MapPin size={16} class="shrink-0 text-fg-faint" />
    <div class="min-w-0 flex-1">
      <AddressField
        bind:value={draft}
        ariaLabel="Where it is"
        autofocus
        onpick={(suggestion) => commit(suggestion.address)}
        oncommit={commit}
      />
    </div>
  </div>
{:else if location}
  <div class="flex w-full items-start gap-3 py-1.5">
    <MapPin size={16} class="mt-0.5 shrink-0 text-fg-muted" />
    <div class="min-w-0 flex-1 space-y-1.5">
      <div class="flex items-start gap-1">
        {#if editable}
          <button type="button" onclick={begin} class="t-label min-w-0 flex-1 break-words text-left hover:text-fg">
            {location}
          </button>
          <button
            type="button"
            aria-label="Remove location"
            onclick={() => onchange("")}
            class="press-sm shrink-0 rounded-md p-1 text-fg-faint hover:text-fg"
          >
            <X size={14} />
          </button>
        {:else}
          <p class="t-label break-words">{location}</p>
        {/if}
      </div>
      {#if travelTo}
        <div class="flex flex-wrap items-center gap-2">
          <OriginPicker {eventId} />
          <TravelChips {eventId} destination={travelTo} {arriveBy} {onopen} />
        </div>
      {/if}
    </div>
  </div>
{:else if editable}
  <button
    type="button"
    onclick={begin}
    class="press-sm hoverable -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-md px-1 py-1.5 text-left"
  >
    <MapPin size={16} class="shrink-0 text-fg-faint" />
    <span class="t-label text-fg-faint">Location</span>
  </button>
{:else}
  <div class="flex w-full items-center gap-3 py-1.5">
    <MapPin size={16} class="shrink-0 text-fg-faint" />
    <span class="t-label text-fg-faint">No location</span>
  </div>
{/if}
