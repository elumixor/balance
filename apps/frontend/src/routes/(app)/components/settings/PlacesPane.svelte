<script lang="ts">
  import { AddressField, Field, MapPreview, NumberField, Switch, Tooltip } from "$lib/components";
  import PlaceIconPicker from "./PlaceIconPicker.svelte";
  import { iconFor, PLACE_ICON } from "$lib/ui/icons";
  import type { PlaceDetails, PlaceSuggestion } from "$lib/travel/places";
  import { preferences } from "$lib/account/preferences.svelte";
  import type { SavedLocation, TravelMode } from "$lib/account/preferences-types";
  import { Bike, Bus, Car, Footprints, Pencil, Plus, Trash2 } from "lucide-svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * The places you leave from, and how you get around.
   *
   * This was one address called "usually leaving from", which is wrong the moment you have two:
   * the gym is not left from the office, and on a Saturday you are at neither. So it is a list,
   * each place named, and any event's journey can start from whichever one — or from wherever
   * the phone is standing, which is the answer for a day that doesn't start anywhere planned.
   *
   * A row is a glyph, a name and its address, and nothing on it is a field: everything about a
   * place is changed in one form, opened by the pencil, which is also the form a new place is
   * typed into. The default is said in words on the row and set by a switch in the form, because
   * a tick with no word beside it was read as "done" rather than "from here".
   */
  const locations = $derived(preferences.travel.locations);
  const defaultId = $derived(preferences.travel.defaultLocationId);

  /** The form: a new place, or the id of the one being changed. */
  let editing = $state<"new" | string | null>(null);
  let label = $state("");
  let address = $state("");
  let icon = $state<string | undefined>(undefined);
  let isDefault = $state(false);
  /** Google's own pin for what was typed, once a suggestion was chosen or the map looked it up. */
  let pinned = $state<PlaceDetails | null>(null);

  function open(location?: SavedLocation) {
    editing = location?.id ?? "new";
    label = location?.label ?? "";
    address = location?.address ?? "";
    icon = location?.icon;
    // The first place is the default without asking: somebody who named one address meant it.
    isDefault = location ? location.id === defaultId : locations.length === 0;
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
    if (!canSave) return;
    // The pin only describes the address it was looked up for; a retyped one is saved bare.
    const pin = pinned && pinned.address === address.trim() ? pinned : null;
    const patch = {
      label,
      address: address.trim(),
      icon,
      placeId: pin?.placeId ?? null,
      latitude: pin?.latitude,
      longitude: pin?.longitude,
    };
    const id = editing === "new" ? preferences.addLocation(patch) : editing;
    if (!id) return;
    if (editing !== "new") preferences.updateLocation(id, patch);
    if (isDefault) preferences.setTravel({ defaultLocationId: id });
    else if (defaultId === id) preferences.setTravel({ defaultLocationId: null });
    editing = null;
  }

  const canSave = $derived(label.trim().length > 0 && address.trim().length > 0);

  const MODES: { value: TravelMode; label: string; icon: typeof Bus }[] = [
    { value: "transit", label: "Transit", icon: Bus },
    { value: "drive", label: "Drive", icon: Car },
    { value: "bicycle", label: "Cycle", icon: Bike },
    { value: "walk", label: "Walk", icon: Footprints },
  ];
</script>

{#snippet form()}
  <form
    class="space-y-2 p-2"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <div class="flex items-center gap-1">
      <PlaceIconPicker {icon} label={label || "this place"} onchange={(next) => (icon = next)} />
      <Field bind:value={label} placeholder="Home, Office" ariaLabel="Name of this place" autocapitalize="sentences" />
    </div>
    <AddressField
      bind:value={address}
      ariaLabel="Address of this place"
      autofocus={editing === "new"}
      onpick={picked}
      oncommit={save}
    />
    <MapPreview
      {address}
      placeId={pinned?.address === address.trim() ? pinned.placeId : null}
      onplace={(place) => {
        if (place.address) address = place.address;
        pinned = place;
      }}
    />
    <div class="flex items-center gap-3">
      <label class="flex items-center gap-2">
        <Switch checked={isDefault} label="Journeys start here unless an event says otherwise" onchange={(next) => (isDefault = next)} />
        <span class="t-label text-fg">Start journeys here</span>
      </label>
      <span class="flex-1"></span>
      <button type="button" onclick={() => (editing = null)} class="press t-label h-9 px-2 text-fg-muted">
        Cancel
      </button>
      <button
        type="submit"
        disabled={!canSave}
        class="press t-label h-9 shrink-0 rounded-md border border-ink bg-ink px-3 text-ink-fg
          disabled:border-line disabled:bg-surface-alt disabled:text-fg-faint"
      >
        Save
      </button>
    </div>
  </form>
{/snippet}

<SettingsGroup title="Places and travel" divided={false}>
  <div class="overflow-hidden rounded-md border border-line">
    {#each locations as location, index (location.id)}
      {@const Glyph = iconFor(location.icon ?? PLACE_ICON)}
      <div class={index > 0 ? "border-t border-line" : ""}>
        {#if editing === location.id}
          {@render form()}
        {:else}
          <div class="group flex items-center gap-3 px-3 py-2">
            <Glyph size={16} class="shrink-0 text-fg-muted" />
            <div class="min-w-0 flex-1">
              <p class="t-label flex items-center gap-2 text-fg">
                <span class="truncate">{location.label}</span>
                {#if location.id === defaultId}
                  <span class="t-micro shrink-0 rounded-full bg-surface-alt px-1.5 py-px text-fg-muted">default</span>
                {/if}
              </p>
              <p class="t-micro truncate text-fg-faint">{location.address}</p>
            </div>
            <Tooltip label="Edit">
              <button
                type="button"
                aria-label="Edit {location.label}"
                onclick={() => open(location)}
                class="bare-button size-7"
              >
                <Pencil size={14} />
              </button>
            </Tooltip>
            <Tooltip label="Remove">
              <button
                type="button"
                aria-label="Remove {location.label}"
                onclick={() => preferences.removeLocation(location.id)}
                class="bare-button size-7 hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </Tooltip>
          </div>
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
        class="hoverable flex w-full items-center gap-3 px-3 py-2 {locations.length > 0 ? 'border-t border-line' : ''}"
      >
        <Plus size={16} class="shrink-0 text-fg-muted" />
        <span class="t-label text-fg-muted">{locations.length === 0 ? "Add your first place" : "Add a place"}</span>
      </button>
    {/if}
  </div>

  <!-- One line: the ways of going, in the order they're offered, and how early to be there. -->
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <div class="flex items-center gap-1" role="group" aria-label="Ways of getting there">
      {#each MODES as mode (mode.value)}
        {@const selected = preferences.travel.modes.includes(mode.value)}
        <Tooltip label={mode.label}>
          <button
            type="button"
            aria-label={mode.label}
            aria-pressed={selected}
            onclick={() => preferences.toggleMode(mode.value)}
            class="press-sm flex size-8 items-center justify-center rounded-md border transition-colors
              {selected ? 'border-ink bg-ink text-ink-fg' : 'border-line bg-surface text-fg-muted'}"
          >
            <mode.icon size={15} />
          </button>
        </Tooltip>
      {/each}
    </div>
    <label class="flex items-center gap-1 text-fg-muted">
      <span class="t-label">Arrive</span>
      <NumberField
        value={preferences.travel.bufferMinutes}
        unit="min"
        ariaLabel="Minutes to be there early"
        inputmode="numeric"
        width="w-8"
        onchange={(bufferMinutes) => preferences.setTravel({ bufferMinutes: Math.max(0, Math.round(bufferMinutes)) })}
      />
      <span class="t-label">early</span>
    </label>
  </div>
</SettingsGroup>
