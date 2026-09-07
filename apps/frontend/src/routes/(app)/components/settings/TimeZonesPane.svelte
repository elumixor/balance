<script lang="ts">
  import { Button, ComboField, Field, Tooltip } from "$lib/components";
  import { clock } from "$lib/platform/clock.svelte";
  import { preferences } from "$lib/account/preferences.svelte";
  import { offsetLabel, searchZones } from "$lib/calendar/time-zones";
  import { Globe, Plus, Trash2 } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";
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

<SettingsGroup title="Time zones">
  <div class="space-y-1">
    {#each zones as saved (saved.id)}
      <div class="flex min-h-9 items-center gap-3 rounded-md px-1.5 py-1">
        <span class="flex size-7 shrink-0 items-center justify-center text-fg-muted"><Globe size={16} /></span>
        <div class="-mx-2 min-w-0 flex-1">
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
            class="bare-button size-7 hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        </Tooltip>
      </div>
    {/each}

    {#if adding}
      <div class="space-y-2 rounded-md border border-line p-2">
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
          <Button label="Cancel" variant="bare" onclick={() => (adding = false)} />
          <Button label="Save" size="sm" disabled={!label.trim() || !zone} onclick={save} />
        </div>
      </div>
    {:else}
      <SettingRow icon={Plus} label={zones.length === 0 ? "Name your first zone" : "Name a zone"} onclick={open} />
    {/if}
  </div>
</SettingsGroup>
