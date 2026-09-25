<script lang="ts">
  import type { Person } from "$lib/people/types";
  import Avatar from "./Avatar.svelte";

  /** Who else is in this — a row of overlapping faces, and a count for whoever didn't fit. */
  let { people, size = 20, max = 6 }: { people: readonly Person[]; size?: number; max?: number } = $props();

  const shown = $derived(people.slice(0, max));
  const rest = $derived(people.length - shown.length);
</script>

{#if people.length > 0}
  <span class="flex items-center" style="padding-left:{Math.round(size / 4)}px">
    {#each shown as person (person.id)}
      <Avatar {person} {size} class="border border-surface" style="margin-left:-{Math.round(size / 4)}px" />
    {/each}
    {#if rest > 0}
      <span
        style="width:{size}px;height:{size}px;margin-left:-{Math.round(size / 4)}px;font-size:{Math.round(size * 0.42)}px"
        class="t-micro flex items-center justify-center rounded-full border border-surface bg-surface-alt text-fg-muted"
      >
        +{rest}
      </span>
    {/if}
  </span>
{/if}
