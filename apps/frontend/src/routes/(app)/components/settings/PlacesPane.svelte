<script lang="ts">
  import { AddressField, Button, Divider, Field, MapPreview, NumberField, Switch, Tooltip } from "$lib/components";
  import PlaceIconPicker from "./PlaceIconPicker.svelte";
  import { iconFor, PLACE_ICON } from "$lib/ui/icons";
  import type { PlaceDetails, PlaceSuggestion } from "$lib/travel/places";
  import { preferences } from "$lib/account/preferences.svelte";
  import type { SavedLocation, TravelMode } from "$lib/account/preferences-types";
  import { placesImport } from "$lib/travel/places-import.svelte";
  import { Bike, Bus, Car, Download, Footprints, Plus, Route, Timer, Trash2 } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";
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
   * place is changed in one form, opened by pressing the row, which is also the form a new place is
   * typed into and the one boxed thing on the page, so the row being edited stands out from the
   * list. The default is said in words on the row and set by a switch in the form, because
   * a tick with no word beside it was read as "done" rather than "from here".
   */
  const locations = $derived(preferences.travel.locations);
  const defaultId = $derived(preferences.travel.defaultLocationId);

  /**
   * The places already named in Google Maps, taken from a Takeout export.
   *
   * Home and the office are said once, in Maps, by everybody who uses it, and Google offers no
   * way to ask for them — saved places and labels are Maps' own account data, not anything the
   * Places API indexes. So the way in is the file Takeout gives back, and this is the button that
   * opens it; the sheet that lists what is inside is `ImportPlacesDialog.svelte`, and a file
   * dropped on the window arrives at the same place.
   */
  let picker = $state<HTMLInputElement>();

  function chooseFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared straight away, or choosing the same file twice in a row fires no event the second time.
    input.value = "";
    if (file) void placesImport.receiveFile(file);
  }

  /** The form: a new place, or the id of the one being changed. */
  let editing = $state<"new" | string | null>(null);
  let label = $state("");
  let address = $state("");
  let icon = $state<string | undefined>(undefined);
  let isDefault = $state(false);
  /** Google's own pin for what was typed, once a suggestion was chosen or the map looked it up. */
  let pinned = $state<PlaceDetails | null>(null);
  /** The text that pin was looked up for, so a since-retyped address is saved without it. */
  let pinnedFor = $state("");

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
    pinnedFor = pinned ? address : "";
  }

  function picked(suggestion: PlaceSuggestion) {
    // Google's own name for the place is a better first guess than an empty box.
    if (!label.trim()) label = suggestion.name;
    pinned = null;
    pinnedFor = "";
  }

  function save() {
    if (!canSave) return;
    // The pin only describes the address it was looked up for; a retyped one is saved bare.
    const pin = pinnedFor === address.trim() ? pinned : null;
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
      placeId={pinnedFor === address.trim() ? (pinned?.placeId ?? null) : null}
      onplace={(place, query) => {
        pinned = place;
        pinnedFor = query;
      }}
    />
    <div class="flex items-center gap-3">
      <label class="flex items-center gap-2">
        <Switch checked={isDefault} label="Journeys start here unless an event says otherwise" onchange={(next) => (isDefault = next)} />
        <span class="t-label text-fg">Start journeys here</span>
      </label>
      <span class="flex-1"></span>
      <Button label="Cancel" variant="bare" onclick={() => (editing = null)} />
      <Button label="Save" size="sm" disabled={!canSave} onclick={save} />
    </div>
  </form>
{/snippet}

<SettingsGroup title="Places and travel">
  <div class="space-y-1">
    {#each locations as location (location.id)}
      {#if editing === location.id}
        <div class="rounded-md border border-line">{@render form()}</div>
      {:else}
        <SettingRow
          icon={iconFor(location.icon ?? PLACE_ICON)}
          label={location.id === defaultId ? `${location.label} · default` : location.label}
          note={location.address}
          onclick={() => open(location)}
        >
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
        </SettingRow>
      {/if}
    {/each}

    {#if editing === "new"}
      <div class="rounded-md border border-line">{@render form()}</div>
    {:else}
      <SettingRow icon={Plus} label={locations.length === 0 ? "Add your first place" : "Add a place"} onclick={() => open()} />
    {/if}

    <SettingRow
      icon={Download}
      label="Import from Google Maps"
      note="Your labelled and saved places, from a Google Takeout export"
      onclick={() => picker?.click()}
    />
    <input
      bind:this={picker}
      type="file"
      accept=".json,.geojson,application/json,application/geo+json"
      onchange={chooseFile}
      class="hidden"
      aria-hidden="true"
      tabindex="-1"
    />
  </div>

  <Divider />

  <!-- The ways of going, in the order they're offered, and how early to be there. -->
  <div class="space-y-1">
    <SettingRow icon={Route} label="Get there by">
      <div class="flex items-center gap-1" role="group" aria-label="Ways of getting there">
        {#each MODES as mode (mode.value)}
          {@const selected = preferences.travel.modes.includes(mode.value)}
          <Tooltip label={mode.label}>
            <button
              type="button"
              aria-label={mode.label}
              aria-pressed={selected}
              onclick={() => preferences.toggleMode(mode.value)}
              class="icon-toggle"
            >
              <mode.icon size={15} />
            </button>
          </Tooltip>
        {/each}
      </div>
    </SettingRow>
    <SettingRow icon={Timer} label="Arrive early">
      <NumberField
        value={preferences.travel.bufferMinutes}
        unit="min"
        ariaLabel="Minutes to be there early"
        inputmode="numeric"
        width="w-8"
        onchange={(bufferMinutes) => preferences.setTravel({ bufferMinutes: Math.max(0, Math.round(bufferMinutes)) })}
      />
    </SettingRow>
  </div>
</SettingsGroup>
