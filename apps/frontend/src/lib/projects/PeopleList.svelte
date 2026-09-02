<script lang="ts">
  import { Plus, Users, X } from "lucide-svelte";

  /** Who else is in it. Names, not accounts — the app owes them nothing but a mention. */
  let { people, onchange }: { people: string[]; onchange: (people: string[]) => void } = $props();

  let draft = $state("");

  function add() {
    const name = draft.trim();
    if (!name || people.includes(name)) return void (draft = "");
    onchange([...people, name]);
    draft = "";
  }
</script>

<div class="flex flex-wrap items-center gap-1.5">
  <Users size={14} class="shrink-0 text-fg-faint" />
  {#each people as person (person)}
    <span class="t-micro flex items-center gap-1 rounded-sm bg-surface-alt py-0.5 pr-1 pl-2 text-fg">
      {person}
      <button
        type="button"
        aria-label="Remove {person}"
        onclick={() => onchange(people.filter((p) => p !== person))}
        class="press-sm rounded-sm p-0.5 text-fg-faint hover:text-fg"
      >
        <X size={11} />
      </button>
    </span>
  {/each}
  <span class="flex items-center gap-1">
    <Plus size={12} class="text-fg-faint" />
    <input
      bind:value={draft}
      placeholder={people.length ? "Add" : "Who else is in it"}
      aria-label="Add a person"
      onkeydown={(e) => e.key === "Enter" && add()}
      onblur={add}
      class="t-micro h-6 w-32 bg-transparent placeholder:text-fg-faint focus:outline-none"
    />
  </span>
</div>
