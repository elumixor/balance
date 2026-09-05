<script lang="ts">
  import { Star } from "lucide-svelte";
  import type { Rank } from "$lib/planning/types";

  /**
   * Where you are, in one line: the stars, and how far the next line is.
   *
   * The tier is drawn as filled pips rather than as a number, because "Tier 2, subtier 3" is a
   * database row and five dots with three of them lit is a place you recognise on sight.
   */
  let { rank, compact = false }: { rank: Rank; compact?: boolean } = $props();

  const SUBTIERS = 5;
</script>

<div class="flex items-center gap-2">
  <span class="flex items-center gap-1 rounded-full bg-surface-alt px-2.5 py-1">
    <Star size={13} class="text-amber-400" fill="currentColor" />
    <span class="t-label tabular-nums">{rank.stars}</span>
  </span>

  {#if !compact}
    <span class="flex items-center gap-1" aria-label="Tier {rank.tier + 1}, {rank.subtier + 1} of {SUBTIERS}">
      {#each Array.from({ length: SUBTIERS }) as _, index}
        <span
          class="h-1.5 w-1.5 rounded-full {index <= rank.subtier ? 'bg-ink' : 'bg-line-strong'}"
        ></span>
      {/each}
    </span>
    <span class="t-micro text-fg-faint">{rank.toNextSubtier} to go</span>
  {/if}
</div>
