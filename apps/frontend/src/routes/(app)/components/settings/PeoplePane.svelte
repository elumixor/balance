<script lang="ts">
  import { Field } from "$lib/components";
  import { peopleDirectory } from "$lib/people/directory.svelte";
  import { Plus, Search } from "lucide-svelte";
  import { untrack } from "svelte";
  import PersonRow from "./PersonRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * Everyone the account knows, in one list. It fills itself from the guest lists of recent
   * events, so most rows were never typed; what is done here is correcting a name Google spelled
   * badly, giving somebody a face, or adding a person the calendar has never met.
   */
  let query = $state("");
  let adding = $state("");
  /** The row whose field has the caret, while it does. */
  let editingId = $state<string | null>(null);
  /** The order the rows were last sorted into — held still while one of them is being typed into. */
  let order = $state<string[]>([]);

  const byId = $derived(new Map(peopleDirectory.all.map((person) => [person.id, person])));

  // Alphabetical, re-sorted only between edits: a renamed row keeps its place until the field is
  // left, and a row added meanwhile goes on the end rather than reshuffling everything.
  $effect(() => {
    const sorted = peopleDirectory.all.toSorted((a, b) => a.name.localeCompare(b.name)).map((person) => person.id);
    if (editingId === null) {
      order = sorted;
      return;
    }
    // Untracked: the effect writes the order, and reading its own result back would loop it.
    const kept = untrack(() => order).filter((id) => byId.has(id));
    const known = new Set(kept);
    order = [...kept, ...sorted.filter((id) => !known.has(id))];
  });

  const people = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const all = order.flatMap((id) => byId.get(id) ?? []);
    if (!needle) return all;
    return all.filter((p) => p.name.toLowerCase().includes(needle) || p.email?.toLowerCase().includes(needle));
  });

  function add() {
    const typed = adding.trim();
    adding = "";
    if (typed) peopleDirectory.ensure(typed);
  }
</script>

<SettingsGroup title="People">
  <div class="space-y-1">
    {#if peopleDirectory.all.length > 8}
      <div class="relative px-1.5">
        <Search size={14} class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-faint" />
        <Field bind:value={query} placeholder="Find someone" ariaLabel="Find someone" class="h-8! pl-8!" />
      </div>
    {/if}

    {#each people as person (person.id)}
      <PersonRow {person} onediting={(editing) => (editingId = editing ? person.id : editingId === person.id ? null : editingId)} />
    {:else}
      <p class="t-micro px-1.5 py-2 text-fg-faint">
        {query ? "Nobody by that name." : "Nobody yet. People arrive from your events, or are added here."}
      </p>
    {/each}

    <div class="flex min-h-9 items-center gap-3 px-1.5 py-1">
      <span class="flex size-7 shrink-0 items-center justify-center text-fg-muted"><Plus size={16} /></span>
      <Field
        bind:value={adding}
        variant="bare"
        placeholder="Add someone by name or email"
        ariaLabel="Add someone by name or email"
        autocapitalize="sentences"
        onkeydown={(e) => {
          if (e.key === "Enter") add();
        }}
      />
    </div>
  </div>
</SettingsGroup>
