<script lang="ts">
  import { AddressField, Chip, Field, MapPreview, NumberField, PlaceIconPicker, Tooltip } from "$lib/components";
  import type { PlaceDetails, PlaceSuggestion } from "$lib/places";
  import { preferences, type SavedLocation, TRAVEL_MODES } from "$lib/preferences.svelte";
  import { Check, Plus, Trash2 } from "lucide-svelte";
  import ChoiceRow from "./ChoiceRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * The places you leave from, and how you get around.
   *
   * This was one address called "usually leaving from", which is wrong the moment you have two:
   * the gym is not left from the office, and on a Saturday you are at neither. So it is a list,
   * each place named, and any event's journey can start from whichever one — or from wherever
   * the phone is standing, which is the answer for a day that doesn't start anywhere planned.
   *
   * The tick is the default rather than a separate control: a list of places where one of them is
   * the usual one is the whole rule, and a "default" dropdown listing the same names again would
   * be the second place to change it.
   *
   * Pressing an address opens it for editing under a map, the same form a new place is typed
   * into — a typo is put right where it was made, not by deleting the place and starting over.
   */
  const locations = $derived(preferences.travel.locations);
  const defaultId = $derived(preferences.travel.defaultLocationId);

  /** The form: a new place, or the id of the one being changed. */
  let editing = $state<"new" | string | null>(null);
  let label = $state("");
  let address = $state("");
  /** Google's own pin for what was typed, once a suggestion was chosen or the map looked it up. */
  let pinned = $state<PlaceDetails | null>(null);

  function open(location?: SavedLocation) {
    editing = location?.id ?? "new";
    label = location?.label ?? "";
    address = location?.address ?? "";
    pinned =
      location?.latitude !== undefined && location.longitude !== undefined
        ? {
            placeId: location.placeId ?? null,
            address: location.address,
            latitude: location.latitude,
            longitude: location.longitude,
          }
        : null;
  }

  function picked(suggestion: PlaceSuggestion) {
    // Google's own name for the place is a better first guess than an empty box.
    if (!label.trim()) label = suggestion.name;
    pinned = null;
  }

  function save() {
    if (!label.trim() || !address.trim()) return;
    // The pin only describes the address it was looked up for; a retyped one is saved bare.
    const pin = pinned && pinned.address === address.trim() ? pinned : null;
    const patch = {
      label,
      address: address.trim(),
      placeId: pin?.placeId ?? null,
      latitude: pin?.latitude,
      longitude: pin?.longitude,
    };
    if (editing === "new") preferences.addLocation(patch);
    else if (editing) preferences.updateLocation(editing, patch);
    editing = null;
  }

  const canSave = $derived(label.trim().length > 0 && address.trim().length > 0);
</script>

{#snippet form()}
  <form
    class="space-y-2 p-2"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <AddressField bind:value={address} ariaLabel="Address of this place" autofocus onpick={picked} oncommit={save} />
    <MapPreview
      {address}
      placeId={pinned?.address === address.trim() ? pinned.placeId : null}
      onplace={(place) => {
        if (place.address) address = place.address;
        pinned = place;
      }}
    />
    <div class="flex items-center gap-2">
      <Field
        bind:value={label}
        placeholder="Call it something — Home, Office"
        ariaLabel="Name of this place"
        autocapitalize="sentences"
      />
      <button
        type="submit"
        disabled={!canSave}
        class="press t-label h-10 shrink-0 rounded-md border border-ink bg-ink px-3 text-ink-fg
          disabled:border-line disabled:bg-surface-alt disabled:text-fg-faint"
      >
        Save
      </button>
      <button type="button" onclick={() => (editing = null)} class="press t-label h-10 px-2 text-fg-muted">
        Cancel
      </button>
    </div>
  </form>
{/snippet}

<SettingsGroup
  title="Places"
  note="Where journeys start. Any event can be told to leave from a different one."
  divided={false}
>
  <div class="overflow-hidden rounded-md border border-line">
    {#each locations as location, index (location.id)}
      {@const isDefault = location.id === defaultId}
      <div class={index > 0 ? "border-t border-line" : ""}>
        <div class="flex items-center gap-2 px-2 py-2">
          <Tooltip label={isDefault ? "Journeys start here" : "Start journeys here"}>
            <button
              type="button"
              aria-label="Start journeys from {location.label}"
              aria-pressed={isDefault}
              onclick={() => preferences.setTravel({ defaultLocationId: isDefault ? null : location.id })}
              class="press-sm flex size-5 shrink-0 items-center justify-center rounded-full border
                {isDefault ? 'border-ink bg-ink text-ink-fg' : 'border-line-strong text-transparent'}"
            >
              <Check size={12} />
            </button>
          </Tooltip>
          <PlaceIconPicker
            icon={location.icon}
            label={location.label}
            onchange={(icon) => preferences.updateLocation(location.id, { icon })}
          />
          <div class="min-w-0 flex-1">
            <Field
              value={location.label}
              oninput={(next) => preferences.updateLocation(location.id, { label: next })}
              variant="bare"
              ariaLabel="Name of this place"
              autocapitalize="sentences"
            />
            {#if editing !== location.id}
              <button
                type="button"
                onclick={() => open(location)}
                aria-label="Change the address of {location.label}"
                class="t-micro block max-w-full truncate rounded-md px-2 text-left text-fg-faint hover:text-fg"
              >
                {location.address}
              </button>
            {/if}
          </div>
          <Tooltip label="Remove">
            <button
              type="button"
              aria-label="Remove {location.label}"
              onclick={() => preferences.removeLocation(location.id)}
              class="press-sm flex size-7 shrink-0 items-center justify-center rounded-md text-fg-faint
                hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
        {#if editing === location.id}
          {@render form()}
        {/if}
      </div>
    {/each}

    {#if editing === "new"}
      <div class="border-t border-line {locations.length === 0 ? 'border-t-0' : ''}">
        {@render form()}
      </div>
    {:else}
      <button
        type="button"
        onclick={() => open()}
        class="hoverable flex w-full items-center gap-2 px-2 py-2.5 {locations.length > 0
          ? 'border-t border-line'
          : ''}"
      >
        <span class="flex size-5 items-center justify-center">
          <Plus size={15} class="text-fg-muted" />
        </span>
        <span class="t-label text-fg-muted">{locations.length === 0 ? "Add your first place" : "Add a place"}</span>
      </button>
    {/if}
  </div>
</SettingsGroup>

<SettingsGroup title="Travel">
  <ChoiceRow label="Ways of getting there" note="A journey is offered for each of them, the first one first.">
    {#snippet control()}
      <div class="flex flex-wrap gap-1.5">
        {#each TRAVEL_MODES as mode (mode.value)}
          <Chip
            label={mode.label}
            selected={preferences.travel.modes.includes(mode.value)}
            onclick={() => preferences.toggleMode(mode.value)}
          />
        {/each}
      </div>
    {/snippet}
  </ChoiceRow>

  <ChoiceRow label="Be there early by" note="Added to every journey, so leaving on time means arriving early.">
    {#snippet control()}
      <NumberField
        value={preferences.travel.bufferMinutes}
        unit="min"
        ariaLabel="Minutes to be there early"
        inputmode="numeric"
        onchange={(bufferMinutes) => preferences.setTravel({ bufferMinutes: Math.max(0, Math.round(bufferMinutes)) })}
      />
    {/snippet}
  </ChoiceRow>
</SettingsGroup>
