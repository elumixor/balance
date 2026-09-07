<script lang="ts">
  import { preferences } from "$lib/account/preferences.svelte";
  import { assistEndPlace } from "$lib/calendar/queries";
  import type { CalendarEvent } from "$lib/calendar/types";
  import { AddressField, Button, CardRow, Field, MapPreview, Popover, PopoverItem } from "$lib/components";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import type { PlaceDetails } from "$lib/travel/places";
  import { iconFor, PLACE_ICON } from "$lib/ui/icons";
  import { MapPinCheck, MapPinOff, Pencil, Plus, Sparkles } from "lucide-svelte";

  /**
   * Where it leaves you. Most events leave you where you were, so the row recedes until it is
   * set; a flight, a move, the drive to the cabin say where they end, and every journey after
   * starts from there until the next one that says so (`$lib/travel/whereabouts.ts`).
   *
   * The places on offer are the ones you have named — Home, the office — with any address typed
   * with Maps' help as the other answer, and a place can be named from here, since the moment the
   * list is missing one is the moment you are looking at the event that ends there. What is
   * saved is always the address: a place renamed or removed later still leaves the event ending
   * where it did.
   *
   * "Guess" asks the model to read the event — "Bus to Prague (Černý Most)" ends in Prague — and
   * only proposes: the row is written when the guess comes back, and can be changed like any pick.
   *
   * It is a mapping of the app's own rather than a field of the invitation, so it works on an
   * event you can't otherwise change, and the row is never disabled.
   */
  let {
    event,
    endLocation,
    onchange,
  }: {
    event: CalendarEvent;
    endLocation: string | null;
    onchange: (endLocation: string | null) => void;
  } = $props();

  const locations = $derived(preferences.travel.locations);
  /** The named place this address belongs to, when it is one of them. */
  const named = $derived(locations.find((one) => one.address === endLocation) ?? null);
  const label = $derived(named?.label ?? endLocation);

  let mode = $state<"list" | "typing" | "adding">("list");
  let guessing = $state(false);
  /** The model read the event and found no journey in it — said once, on the item that asked. */
  let nothingGuessed = $state(false);
  let address = $state("");
  let name = $state("");
  /** Google's own pin for the address, once the map has looked it up. */
  let pinned = $state<PlaceDetails | null>(null);
  /** The text that pin was looked up for, so a since-retyped address is saved without it. */
  let pinnedFor = $state("");

  function pick(next: string | null, close: () => void) {
    if (next !== endLocation) onchange(next);
    mode = "list";
    close();
  }

  function start(next: "typing" | "adding") {
    mode = next;
    address = next === "typing" ? (named ? "" : (endLocation ?? "")) : "";
    name = "";
    pinned = null;
    pinnedFor = "";
  }

  async function guess(close: () => void) {
    if (guessing) return;
    guessing = true;
    nothingGuessed = false;
    try {
      const answer = await assistEndPlace({
        title: event.title,
        description: event.description ?? "",
        location: event.location,
        places: locations.map((one) => ({ label: one.label, address: one.address })),
      });
      const address = answer.available ? answer.suggestion.address?.trim() || null : null;
      if (address) pick(address, close);
      else nothingGuessed = true;
    } catch (e) {
      diagnostics.report("Travel", e, { title: "The guess didn’t come back" });
    } finally {
      guessing = false;
    }
  }

  /** Named and chosen in one gesture: the place was named in order to end up there. */
  function saveAdded(close: () => void) {
    if (!name.trim() || !address.trim()) return;
    const pin = pinnedFor === address.trim() ? pinned : null;
    preferences.addLocation({
      label: name,
      address: address.trim(),
      placeId: pin?.placeId ?? null,
      latitude: pin?.latitude,
      longitude: pin?.longitude,
    });
    pick(address.trim(), close);
  }
</script>

<Popover width={260} align="start">
  {#snippet trigger(open)}
    {#if label}
      <CardRow icon={MapPinCheck} set onclick={open}>
        <span class="t-label min-w-0 flex-1 break-words text-fg"><span class="text-fg-muted">Ends at</span> {label}</span>
      </CardRow>
    {:else}
      <CardRow icon={MapPinCheck} label="Ends elsewhere" onclick={open} />
    {/if}
  {/snippet}

  {#snippet content(close)}
    {#if mode === "list"}
      <PopoverItem label="Stays where it was" selected={endLocation === null} onclick={() => pick(null, close)}>
        {#snippet icon()}<MapPinOff size={15} class="text-fg-muted" />{/snippet}
      </PopoverItem>
      {#each locations as location (location.id)}
        {@const Glyph = iconFor(location.icon ?? PLACE_ICON)}
        <PopoverItem
          label={location.label}
          selected={named?.id === location.id}
          onclick={() => pick(location.address, close)}
        >
          {#snippet icon()}<Glyph size={15} class="text-fg-muted" />{/snippet}
        </PopoverItem>
      {/each}
      <PopoverItem
        label={endLocation && !named ? endLocation : "Somewhere else"}
        selected={Boolean(endLocation && !named)}
        onclick={() => start("typing")}
      >
        {#snippet icon()}<Pencil size={15} class="text-fg-muted" />{/snippet}
      </PopoverItem>
      <PopoverItem label="Add a place" onclick={() => start("adding")}>
        {#snippet icon()}<Plus size={15} class="text-fg-muted" />{/snippet}
      </PopoverItem>
      <PopoverItem
        label={guessing ? "Guessing…" : nothingGuessed ? "Nothing to guess here" : "Guess"}
        onclick={() => void guess(close)}
      >
        {#snippet icon()}<Sparkles size={15} class="text-fg-muted" />{/snippet}
      </PopoverItem>
    {:else if mode === "typing"}
      <div class="space-y-2 p-2">
        <AddressField
          bind:value={address}
          ariaLabel="Where it leaves you"
          placeholder="Where it leaves you"
          autofocus
          onpick={(suggestion) => pick(suggestion.address, close)}
          oncommit={(value) => pick(value.trim() || null, close)}
        />
        <Button label="Back" variant="bare" onclick={() => (mode = "list")} />
      </div>
    {:else}
      <div class="space-y-2 p-2">
        <AddressField
          bind:value={address}
          ariaLabel="Address of this place"
          autofocus
          onpick={(suggestion) => {
            if (!name.trim()) name = suggestion.name;
          }}
          oncommit={() => saveAdded(close)}
        />
        <MapPreview
          {address}
          onplace={(place, query) => {
            pinned = place;
            pinnedFor = query;
          }}
        />
        <Field bind:value={name} placeholder="Home, Office" ariaLabel="Name of this place" autocapitalize="sentences" />
        <div class="flex items-center gap-2">
          <Button label="Save and end here" size="sm" full disabled={!name.trim() || !address.trim()} onclick={() => saveAdded(close)} />
          <Button label="Cancel" variant="bare" onclick={() => (mode = "list")} />
        </div>
      </div>
    {/if}
  {/snippet}
</Popover>
