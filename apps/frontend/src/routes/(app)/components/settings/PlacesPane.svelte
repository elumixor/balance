<script lang="ts">
  import { AddressField, Chip, Field, NumberField, Tooltip } from "$lib/components";
  import { preferences, TRAVEL_MODES } from "$lib/preferences.svelte";
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
</script>

<SettingsGroup
  title="Places"
  note={preferences.travelAvailable
    ? "Where journeys start. Any event can be told to leave from a different one."
    : "Journey times are off — the server has no Google Maps key. Places can still be saved."}
  divided={false}
>
  <div class="overflow-hidden rounded-md border border-line">
    {#each locations as location, index (location.id)}
      {@const isDefault = location.id === defaultId}
      <div class="flex items-center gap-2 px-2 py-2 {index > 0 ? 'border-t border-line' : ''}">
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
            class="press-sm flex size-7 shrink-0 items-center justify-center rounded-md text-fg-faint
              hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        </Tooltip>
      </div>
    {/each}

    {#if adding}
      <div class="space-y-2 border-t border-line p-2 {locations.length === 0 ? 'border-t-0' : ''}">
        <AddressField
          bind:value={address}
          ariaLabel="Address of this place"
          autofocus
          onpick={(suggestion) => {
            // Google's own name for the place is a better first guess than an empty box.
            if (!label.trim()) label = suggestion.name;
          }}
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
  <ChoiceRow label="Ways of getting there" note="A journey is offered for each of them.">
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
