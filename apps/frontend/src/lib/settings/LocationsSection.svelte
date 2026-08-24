<script lang="ts">
  import AddressField from "$lib/components/AddressField.svelte";
  import Chip from "$lib/components/Chip.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import Field from "$lib/components/Field.svelte";
  import NumberField from "$lib/components/NumberField.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import { preferences, TRAVEL_MODES } from "$lib/preferences.svelte";
  import { Check, Clock, Navigation, Plus, Route, Trash2 } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingsSection from "./SettingsSection.svelte";

  /**
   * The places you leave from, and how you get around.
   *
   * This was one address called "usually leaving from", which is wrong the moment you have two:
   * the gym is not left from the office, and on a Saturday you are at neither. So it is a list,
   * each place named, and any event's journey can start from whichever one — or from wherever
   * the phone is standing, which is the answer for a day that doesn't start anywhere planned.
   *
   * The tick is the default rather than a separate control: a list of places where one of them
   * is the usual one is the whole rule, and a "default" dropdown listing the same names again
   * would be the second place to change it.
   */
  const locations = $derived(preferences.travel.locations);
  const defaultId = $derived(preferences.travel.defaultLocationId);

  /** The place being added, held here until it has both halves — a name and an address. */
  let adding = $state(false);
  let label = $state("");
  let address = $state("");

  function open() {
    adding = true;
    label = "";
    address = "";
  }

  function save() {
    if (!label.trim() || !address.trim()) return;
    preferences.addLocation({ label, address });
    adding = false;
  }

  /** Google's own name for the place is a better first guess at what to call it than nothing. */
  function picked(suggestion: { name: string }) {
    if (!label.trim()) label = suggestion.name;
  }
</script>

<SettingsSection
  icon={Route}
  title="Places & travel"
  note={preferences.travelAvailable
    ? undefined
    : "Journey times are off — the server has no Google Maps key. Places can still be saved."}
>
  <div class="space-y-1">
    {#each locations as location (location.id)}
      {@const isDefault = location.id === defaultId}
      <div class="hoverable -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5">
        <Tooltip label={isDefault ? "Journeys start here" : "Start journeys here"}>
          <button
            type="button"
            aria-label="Start journeys from {location.label}"
            aria-pressed={isDefault}
            onclick={() => preferences.setTravel({ defaultLocationId: isDefault ? null : location.id })}
            class="press-sm flex size-6 shrink-0 items-center justify-center rounded-full border
              {isDefault ? 'border-ink bg-ink text-ink-fg' : 'border-line text-transparent'}"
          >
            <Check size={13} />
          </button>
        </Tooltip>
        <div class="min-w-0 flex-1">
          <Field
            value={location.label}
            oninput={(next) => preferences.updateLocation(location.id, { label: next })}
            variant="inline"
            ariaLabel="Name of this place"
            autocapitalize="sentences"
          />
          <p class="t-micro truncate px-2 text-fg-faint">{location.address}</p>
        </div>
        <Tooltip label="Remove">
          <button
            type="button"
            aria-label="Remove {location.label}"
            onclick={() => preferences.removeLocation(location.id)}
            class="press-sm flex size-7 shrink-0 items-center justify-center rounded-md text-fg-faint hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        </Tooltip>
      </div>
    {/each}

    {#if adding}
      <div class="space-y-2 py-1">
        <AddressField
          bind:value={address}
          ariaLabel="Address of this place"
          autofocus
          onpick={picked}
          oncommit={save}
        />
        <div class="flex items-center gap-2">
          <Field
            bind:value={label}
            placeholder="Call it something — Home, Office"
            ariaLabel="Name of this place"
            autocapitalize="sentences"
          />
          <button
            type="button"
            onclick={save}
            disabled={!label.trim() || !address.trim()}
            class="press t-label h-10 shrink-0 rounded-md border border-ink bg-ink px-3 text-ink-fg
              disabled:border-line disabled:bg-surface-alt disabled:text-fg-faint"
          >
            Save
          </button>
          <button type="button" onclick={() => (adding = false)} class="press t-label h-10 px-2 text-fg-muted">
            Cancel
          </button>
        </div>
      </div>
    {:else}
      <button
        type="button"
        onclick={open}
        class="press hoverable -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-2"
      >
        <span class="flex size-6 items-center justify-center">
          <Plus size={15} class="text-fg-muted" />
        </span>
        <span class="t-label text-fg-muted">{locations.length === 0 ? "Add your first place" : "Add a place"}</span>
      </button>
    {/if}
  </div>

  <div class="my-2"><Divider /></div>

  <SettingRow
    icon={Navigation}
    label="Getting there"
    hint="The ways you'd consider going. A journey is offered for each."
    stacked
  >
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
  </SettingRow>

  <SettingRow icon={Clock} label="Arrive early" hint="Added to every journey, so leaving on time means arriving early.">
    {#snippet control()}
      <NumberField
        value={preferences.travel.bufferMinutes}
        unit="min"
        ariaLabel="Minutes to be there early"
        inputmode="numeric"
        onchange={(bufferMinutes) => preferences.setTravel({ bufferMinutes: Math.max(0, Math.round(bufferMinutes)) })}
      />
    {/snippet}
  </SettingRow>
</SettingsSection>
