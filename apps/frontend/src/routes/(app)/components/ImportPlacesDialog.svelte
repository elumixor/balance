<script lang="ts">
  import { Check, MapPin, Search } from "lucide-svelte";
  import { Button, Dialog, Field } from "$lib/components";
  import { preferences } from "$lib/account/preferences.svelte";
  import type { ImportedPlace } from "$lib/travel/google-places";
  import { placesImport } from "$lib/travel/places-import.svelte";
  import { iconFor, PLACE_ICON, searchIcons } from "$lib/ui/icons";

  /**
   * What a Google Maps export holds, before any of it is a place you can leave from.
   *
   * The list is long by nature — a starred list is every restaurant anybody ever meant to try —
   * so the filter is above it and nothing is ticked until somebody ticks it. A place already
   * saved is shown greyed and can't be ticked at all: importing the same file twice is what
   * somebody does when they aren't sure the first one worked.
   */
  const saved = $derived(new Set(preferences.travel.locations.map((one) => one.address.trim().toLowerCase())));

  let query = $state("");

  const rows = $derived(
    placesImport.candidates
      .map((candidate) => ({
        ...candidate,
        already: saved.has((candidate.place.address || candidate.place.label).trim().toLowerCase()),
      }))
      .filter(({ place }) => {
        const q = query.trim().toLowerCase();
        return !q || place.label.toLowerCase().includes(q) || place.address.toLowerCase().includes(q);
      }),
  );
  const tickable = $derived(rows.filter((row) => !row.already));
  const allTicked = $derived(tickable.length > 0 && tickable.every((row) => row.selected));

  /**
   * The glyph an imported place wears. A one-word name that the icon search already knows —
   * "Home", "Work", "Gym" — gets that icon; everything else wears the pin every place wears
   * until somebody picks it something better. Guessing harder than the search itself would be a
   * second, quietly different answer to a question that already has one.
   */
  function iconFrom(place: ImportedPlace) {
    const word = place.label.trim().toLowerCase();
    if (/\s/.test(word)) return undefined;
    return searchIcons(word)[0];
  }
</script>

<Dialog title="Import places" open={placesImport.open} onclose={() => placesImport.dismiss()}>
  <div class="space-y-4">
    <p class="t-micro text-fg-muted">{placesImport.fileName}</p>

    {#if placesImport.imported !== null}
      <p class="t-body flex items-center gap-2">
        <Check size={16} />
        {placesImport.imported} place{placesImport.imported === 1 ? "" : "s"} saved.
      </p>
    {/if}

    {#if placesImport.candidates.length > 0}
      <div class="relative">
        <span class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-fg-faint">
          <Search size={14} />
        </span>
        <Field bind:value={query} placeholder="Find a place" ariaLabel="Find a place in this file" class="pl-9!" />
      </div>

      <div class="flex items-center justify-between">
        <span class="t-micro text-fg-muted">
          {placesImport.selectedCount} of {placesImport.candidates.length} selected
        </span>
        <button
          type="button"
          class="t-micro press-sm rounded-md px-2 py-1 text-fg-muted hoverable"
          onclick={() => placesImport.toggleAll(tickable.map((row) => row.key), !allTicked)}
        >
          {allTicked ? "Select none" : "Select all"}
        </button>
      </div>

      <ul class="max-h-[38vh] space-y-1 overflow-y-auto">
        {#each rows as row (row.key)}
          {@const Glyph = row.already ? MapPin : iconFor(iconFrom(row.place) ?? PLACE_ICON)}
          <li>
            <button
              type="button"
              disabled={row.already}
              class="press-sm flex w-full items-start gap-3 rounded-md border border-line px-3 py-2 text-left
                hoverable disabled:pointer-events-none {row.selected ? '' : 'opacity-50'}"
              aria-pressed={row.selected}
              onclick={() => placesImport.toggle(row.key)}
            >
              <span
                class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-line
                  {row.selected ? 'bg-ink text-ink-fg' : ''}"
              >
                {#if row.selected}<Check size={12} />{/if}
              </span>
              <Glyph size={15} class="mt-0.5 shrink-0 text-fg-muted" />
              <span class="min-w-0 flex-1">
                <span class="t-body block truncate">{row.place.label}</span>
                {#if row.place.address}
                  <span class="t-micro block truncate text-fg-muted">{row.place.address}</span>
                {/if}
                {#if row.already}
                  <span class="t-micro block text-fg-faint">Already saved</span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>

      {#if rows.length === 0}
        <p class="t-micro text-fg-muted">Nothing in this file matches “{query}”.</p>
      {/if}
    {:else}
      <p class="t-body text-fg-muted">
        Nothing to import from this file. Take “Maps” and “Maps (your places)” from Google Takeout, and drop the
        <code class="t-micro">.json</code> files it gives you here.
      </p>
    {/if}

    <div class="flex items-center justify-end gap-2">
      <Button label="Close" variant="bare" onclick={() => placesImport.dismiss()} />
      <Button
        label={placesImport.selectedCount > 0 ? `Save ${placesImport.selectedCount}` : "Save"}
        size="sm"
        disabled={placesImport.selectedCount === 0}
        onclick={() => placesImport.import(iconFrom)}
      />
    </div>
  </div>
</Dialog>
