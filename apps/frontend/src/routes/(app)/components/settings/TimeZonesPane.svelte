<script lang="ts">
  import { ComboField, Field, Tooltip } from "$lib/components";
  import { clock } from "$lib/clock.svelte";
  import { preferences } from "$lib/preferences.svelte";
  import { offsetLabel, searchZones } from "$lib/time-zones";
  import { Plus, Trash2 } from "lucide-svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * The zones you name — "Kyiv", "Prague", "the office" — so an event can be put in one by that
   * name from its card. Each is a name and the IANA zone it stands for; the offset beside it is
   * today's, since it moves twice a year.
   */
  const zones = $derived(preferences.zones);

  let adding = $state(false);
  let label = $state("");
  let query = $state("");
  let zone = $state<string | null>(null);

  const options = $derived(
    searchZones(query).map((one) => ({
      key: one.zone,
      label: one.city,
      hint: offsetLabel(one.zone, clock.now),
      value: one.zone,
    })),
  );

  function open() {
    adding = true;
    label = "";
    query = "";
    zone = null;
  }

  function save() {
    if (!label.trim() || !zone) return;
    preferences.addZone({ label, zone });
    adding = false;
  }
</script>

<SettingsGroup
  title="Time zones"
  note="Zones by the names you use for them. An event's card offers these first."
  divided={false}
>
  <div class="overflow-hidden rounded-md border border-line">
    {#each zones as saved, index (saved.id)}
      <div class="flex items-center gap-2 px-2 py-2 {index > 0 ? 'border-t border-line' : ''}">
        <div class="min-w-0 flex-1">
          <Field
            value={saved.label}
            oninput={(next) => preferences.updateZone(saved.id, { label: next })}
            variant="bare"
            ariaLabel="Name of this zone"
            autocapitalize="sentences"
          />
          <p class="t-micro truncate px-2 text-fg-faint">{saved.zone} · {offsetLabel(saved.zone, clock.now)}</p>
        </div>
        <Tooltip label="Remove">
          <button
            type="button"
            aria-label="Remove {saved.label}"
            onclick={() => preferences.removeZone(saved.id)}
            class="press-sm flex size-7 shrink-0 items-center justify-center rounded-md text-fg-faint hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        </Tooltip>
      </div>
    {/each}

    {#if adding}
      <div class="space-y-2 border-t border-line p-2 {zones.length === 0 ? 'border-t-0' : ''}">
        <ComboField
          bind:value={query}
          {options}
          placeholder="Search a city — Kyiv, Prague"
          ariaLabel="Which zone"
          autofocus
          onpick={(option) => {
            zone = option.value;
            query = option.label;
            if (!label.trim()) label = option.label;
          }}
        />
        <div class="flex items-center gap-2">
          <Field
            bind:value={label}
            placeholder="Call it something — Kyiv, The office"
            ariaLabel="Name of this zone"
            autocapitalize="sentences"
          />
          <button
            type="button"
            onclick={save}
            disabled={!label.trim() || !zone}
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
        class="hoverable flex w-full items-center gap-2 px-2 py-2.5 {zones.length > 0 ? 'border-t border-line' : ''}"
      >
        <span class="flex size-5 items-center justify-center">
          <Plus size={15} class="text-fg-muted" />
        </span>
        <span class="t-label text-fg-muted">{zones.length === 0 ? "Name your first zone" : "Name a zone"}</span>
      </button>
    {/if}
  </div>
</SettingsGroup>
