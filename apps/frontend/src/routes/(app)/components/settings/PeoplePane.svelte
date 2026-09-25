<script lang="ts">
  import { Field } from "$lib/components";
  import { peopleDirectory } from "$lib/people/directory.svelte";
  import { Plus, Search } from "lucide-svelte";
  import PersonRow from "./PersonRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * Everyone the account knows, in one list. It fills itself from the guest lists of recent
   * events, so most rows were never typed; what is done here is correcting a name Google spelled
   * badly, giving somebody a face, or adding a person the calendar has never met.
   */
  let query = $state("");
  let adding = $state("");

  const people = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const all = peopleDirectory.all.toSorted((a, b) => a.name.localeCompare(b.name));
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
      <PersonRow {person} />
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
