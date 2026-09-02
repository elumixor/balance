<script lang="ts">
  import Popover from "$lib/components/Popover.svelte";
  import PopoverItem from "$lib/components/PopoverItem.svelte";
  import { goals } from "$lib/synced.svelte";
  import type { Goal } from "$lib/types";
  import { ChevronDown, Flag, Plus } from "lucide-svelte";
  import { projectsData as data } from "./projects-data.svelte";

  /**
   * Which goal this work serves. Goals are sentences, so the picker is a list of sentences from
   * the same sphere and a line to type a new one — a goal is made where it is first needed, not on
   * a screen of its own.
   */
  let {
    categoryId,
    value,
    onchange,
  }: { categoryId: string; value: Goal | null; onchange: (goalId: string | null) => void } = $props();

  const options = $derived(goals.all.filter((goal) => goal.categoryId === categoryId));
  let draft = $state("");

  function add(close: () => void) {
    const statement = draft.trim();
    if (!statement) return;
    const created = data.createGoal(categoryId, statement);
    draft = "";
    onchange(created.id);
    close();
  }
</script>

<Popover width={300} align="start">
  {#snippet trigger(open)}
    <button
      type="button"
      onclick={open}
      class="press-sm hoverable -mx-2 flex max-w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
    >
      <Flag size={14} class="shrink-0 {value ? 'text-fg-muted' : 'text-fg-faint'}" />
      <span class="t-label min-w-0 truncate {value ? 'text-fg' : 'text-fg-faint'}">
        {value ? value.statement : "Serves no goal yet — drifting"}
      </span>
      <ChevronDown size={13} class="shrink-0 text-fg-faint" />
    </button>
  {/snippet}
  {#snippet content(close)}
    {#each options as goal (goal.id)}
      <PopoverItem
        label={goal.statement}
        selected={goal.id === value?.id}
        onclick={() => {
          onchange(goal.id);
          close();
        }}
      />
    {/each}
    {#if value}
      <PopoverItem
        label="No goal"
        selected={false}
        onclick={() => {
          onchange(null);
          close();
        }}
      />
    {/if}
    <div class="flex items-center gap-1 border-t border-line px-2 py-1.5">
      <Plus size={13} class="shrink-0 text-fg-faint" />
      <input
        bind:value={draft}
        placeholder="New goal, as a sentence"
        aria-label="New goal"
        onkeydown={(e) => e.key === "Enter" && add(close)}
        class="t-label h-8 min-w-0 flex-1 bg-transparent placeholder:text-fg-faint focus:outline-none"
      />
    </div>
  {/snippet}
</Popover>
