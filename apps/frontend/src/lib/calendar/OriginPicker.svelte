<script lang="ts">
  import AddressField from "$lib/components/AddressField.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import PopoverItem from "$lib/components/PopoverItem.svelte";
  import Field from "$lib/components/Field.svelte";
  import { preferences } from "$lib/preferences.svelte";
  import { type OriginChoice, HERE, travelOrigin } from "$lib/travel-origin.svelte";
  import { LocateFixed, MapPin, Plus } from "lucide-svelte";

  /**
   * Where this event's journey starts.
   *
   * One saved address can't answer it: the gym is not left from the office, and on a Saturday you
   * are at neither. So the choice is per event and it sits on the event, next to the journeys it
   * changes — not three screens away in settings, which is where you would have to have guessed
   * the answer before opening this card.
   *
   * A place can be added from inside the picker, because the moment you notice the list is
   * missing one is the moment you are looking at an event that leaves from it.
   */
  let { eventId }: { eventId: string } = $props();

  const choice = $derived(travelOrigin.choiceFor(eventId));
  const locations = $derived(preferences.travel.locations);
  const label = $derived(travelOrigin.labelFor(choice));

  let adding = $state(false);
  let address = $state("");
  let name = $state("");

  function select(next: OriginChoice, close: () => void) {
    travelOrigin.choose(eventId, next);
    close();
  }

  function startAdding() {
    adding = true;
    address = "";
    name = "";
  }

  /** Added and chosen in one gesture: the place was named in order to leave from it. */
  function saveAdded(close: () => void) {
    if (!name.trim() || !address.trim()) return;
    const id = preferences.addLocation({ label: name, address });
    travelOrigin.choose(eventId, { kind: "saved", id });
    adding = false;
    close();
  }
</script>

<Popover width={260} align="start">
  {#snippet trigger(open)}
    <button
      type="button"
      onclick={open}
      aria-label="Where this journey starts"
      class="press-sm flex items-center gap-1.5 rounded-md border border-line px-2 py-1"
    >
      {#if choice.kind === "here"}
        <LocateFixed size={13} class="text-fg-muted" />
      {:else}
        <MapPin size={13} class="text-fg-muted" />
      {/if}
      <span class="t-micro text-fg-muted">from {label}</span>
    </button>
  {/snippet}

  {#snippet content(close)}
    {#if adding}
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
        <Field bind:value={name} placeholder="Home, Office" ariaLabel="Name of this place" autocapitalize="sentences" />
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => saveAdded(close)}
            disabled={!name.trim() || !address.trim()}
            class="press t-label h-9 flex-1 rounded-md border border-ink bg-ink text-ink-fg
              disabled:border-line disabled:bg-surface-alt disabled:text-fg-faint"
          >
            Save and use it
          </button>
          <button type="button" onclick={() => (adding = false)} class="press t-label h-9 px-2 text-fg-muted">
            Cancel
          </button>
        </div>
      </div>
    {:else}
      <PopoverItem
        label="Where I am"
        selected={choice.kind === "here"}
        onclick={() => select(HERE, close)}
      >
        {#snippet icon()}<LocateFixed size={15} class="text-fg-muted" />{/snippet}
      </PopoverItem>
      {#each locations as location (location.id)}
        <PopoverItem
          label={location.label}
          selected={choice.kind === "saved" && choice.id === location.id}
          onclick={() => select({ kind: "saved", id: location.id }, close)}
        >
          {#snippet icon()}<MapPin size={15} class="text-fg-muted" />{/snippet}
        </PopoverItem>
      {/each}
      <PopoverItem label="Add a place" onclick={startAdding}>
        {#snippet icon()}<Plus size={15} class="text-fg-muted" />{/snippet}
      </PopoverItem>
    {/if}
  {/snippet}
</Popover>
