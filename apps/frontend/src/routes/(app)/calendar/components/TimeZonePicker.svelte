<script lang="ts">
  import { AnchoredPopup } from "$lib/components";
  import ComboField, { type ComboOption } from "$lib/components/ComboField.svelte";
  import { deviceTimeZone } from "$lib/planning/zone";
  import { preferences } from "$lib/preferences.svelte";
  import { defaultZones, isValidZone, offsetLabel, searchZones, type ZoneOption } from "$lib/time-zones";
  import { Plus } from "lucide-svelte";
  import type { Snippet } from "svelte";

  /**
   * A zone, by whatever name it goes by here.
   *
   * Before anything is typed the list is the zones this account has named, then the device's own
   * and a few anchors. Typing searches every zone the runtime knows by city — "kyiv", "new york".
   * Typing a word that is no zone at all is how a zone gets a name: Enter on "Office" asks which
   * zone that is, saves the pair to settings, and picks it, all without leaving the card.
   */
  let {
    rect,
    value,
    /** The moment the offsets are worked out for — clocks move, so "GMT+2" depends on the day. */
    at,
    onchoose,
    onclose,
    /** Whatever the caller wants under the search — the grid puts its column actions here. */
    footer,
  }: {
    rect: DOMRect | null;
    value: string | null;
    at: Date;
    onchoose: (zone: string) => void;
    onclose: () => void;
    footer?: Snippet;
  } = $props();

  let query = $state("");
  /** The name being given to a zone, once Enter has been pressed on something that isn't one. */
  let naming = $state<string | null>(null);
  let zoneQuery = $state("");

  const saved = $derived(preferences.zones);
  const hint = (zone: string) => offsetLabel(zone, at);

  const options = $derived.by((): ComboOption<string>[] => {
    const q = query.trim().toLowerCase();
    const named = saved
      .filter((one) => !q || one.label.toLowerCase().includes(q) || one.zone.toLowerCase().includes(q))
      .map((one) => ({ key: `saved:${one.id}`, label: one.label, hint: hint(one.zone), value: one.zone }));
    const found = q ? searchZones(query) : defaultZones(deviceTimeZone());
    const seen = new Set(named.map((one) => one.value));
    const rest = found
      .filter((one) => !seen.has(one.zone))
      .map((one) => ({ key: one.zone, label: one.city, hint: hint(one.zone), value: one.zone }));
    return [...named, ...rest];
  });

  const zoneOptions = $derived(
    searchZones(zoneQuery).map((one: ZoneOption) => ({ key: one.zone, label: one.city, hint: hint(one.zone), value: one.zone })),
  );

  /** A typed name that is a real IANA zone is taken as one; anything else wants naming. */
  function free(text: string) {
    if (isValidZone(text)) return onchoose(text);
    naming = text;
    zoneQuery = "";
  }

  function saveNamed(zone: string) {
    if (!naming) return;
    preferences.addZone({ label: naming, zone });
    onchoose(zone);
  }
</script>

<AnchoredPopup {rect} width={260} {onclose}>
  <div class="flex flex-col gap-1.5 p-1.5">
    {#if naming === null}
      <ComboField
        bind:value={query}
        {options}
        placeholder="Kyiv, Prague, GMT+2…"
        ariaLabel="Search time zones"
        autofocus
        variant="bare"
        width={250}
        onpick={(option) => onchoose(option.value)}
        onfree={free}
      >
        {#snippet row(option, _active)}
          <span class="min-w-0 flex-1 truncate {option.value === value ? 'text-fg' : 'text-fg-muted'}">
            {option.label}
          </span>
          <span class="t-micro shrink-0 text-fg-faint">{option.hint}</span>
        {/snippet}
      </ComboField>
      {#if query.trim() && options.length === 0}
        <button
          type="button"
          onclick={() => free(query.trim())}
          class="menu-row"
        >
          <Plus size={14} class="shrink-0 text-fg-faint" />
          <span>Name a zone “{query.trim()}”</span>
        </button>
      {/if}
      {#if footer}
        <div class="border-line border-t pt-1">
          {@render footer()}
        </div>
      {/if}
    {:else}
      <p class="t-micro px-1 pt-1 text-fg-muted">Which zone is “{naming}”?</p>
      <ComboField
        bind:value={zoneQuery}
        options={zoneOptions}
        placeholder="Search a city"
        ariaLabel="Zone for {naming}"
        autofocus
        variant="bare"
        width={250}
        onpick={(option) => saveNamed(option.value)}
      />
      <button type="button" onclick={() => (naming = null)} class="t-micro px-1 pb-1 text-left text-fg-faint">
        Back
      </button>
    {/if}
  </div>
</AnchoredPopup>
