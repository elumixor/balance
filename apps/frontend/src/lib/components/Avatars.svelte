<script lang="ts">
  import type { Person } from "$lib/projects/types";

  /**
   * Who else is in this — a row of overlapping initials in each person's own colour. Faces are
   * never uploaded here, so a colour and two letters are the whole of what one person looks like.
   */
  let { people, size = 20, max = 6 }: { people: readonly Person[]; size?: number; max?: number } = $props();

  const shown = $derived(people.slice(0, max));
  const rest = $derived(people.length - shown.length);
  const initialsOf = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?";
</script>

{#if people.length > 0}
  <span class="flex items-center" style="padding-left:{Math.round(size / 4)}px">
    {#each shown as person (person.id)}
      <span
        title={person.name}
        style="width:{size}px;height:{size}px;background:{person.color};margin-left:-{Math.round(size / 4)}px;font-size:{Math.round(size * 0.42)}px"
        class="t-micro flex items-center justify-center rounded-full border border-surface font-medium text-white"
      >
        {initialsOf(person.name)}
      </span>
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
