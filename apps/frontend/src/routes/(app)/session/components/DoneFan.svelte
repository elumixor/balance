<script lang="ts">
  import { CategoryIcon } from "$lib/components";
  import { restColor } from "$lib/colors";
  import type { SessionBlock } from "$lib/planning/types";

  /**
   * What was done, thrown down on the table: the day's biggest blocks as a fan of cards, each
   * in its own colour, the last one on top. A list would say the same thing; this says it the way
   * a hand of cards says "look what I've got".
   */
  let { blocks }: { blocks: readonly SessionBlock[] } = $props();

  /** Three cards fan; the biggest block lands on top, where the eye goes first. */
  const POSES = ["rotate(-10deg) translate(-56px, -8px)", "rotate(8deg) translate(56px, -20px)", "rotate(-1deg) translate(0, 26px)"];
  const STAGGER_MS = 110;

  const hand = $derived(blocks.slice(0, POSES.length).reverse());

  function hours(value: number) {
    return `${Math.round(value * 10) / 10}h`;
  }
</script>

<div class="relative mx-auto mt-3 h-44 w-full max-w-xs" aria-hidden="true">
  {#each hand as block, index (block.id)}
    <div
      class="event-fill fan-card absolute inset-x-10 top-10 rounded-xl border border-line px-4 py-3 shadow-(--shadow-float)"
      style="--c:{block.color ?? restColor};--pose:{POSES[index]};animation-delay:{index * STAGGER_MS}ms;z-index:{index}"
    >
      <div class="flex items-center gap-2">
        {#if block.icon && block.color}
          <CategoryIcon icon={block.icon} color={block.color} size={16} />
        {/if}
        <span class="t-label min-w-0 flex-1 truncate">{block.title}</span>
        <span class="t-data text-fg-muted">{hours(block.hours)}</span>
      </div>
      {#if block.categoryName}
        <p class="t-micro mt-1 truncate text-fg-muted">{block.categoryName}</p>
      {/if}
    </div>
  {/each}
</div>

<style>
  .fan-card {
    --mix: 45%;
    transform: var(--pose);
    animation: fan-in 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes fan-in {
    from {
      opacity: 0;
      transform: translateY(48px) scale(0.85);
    }
    to {
      opacity: 1;
      transform: var(--pose);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .fan-card {
      animation: none;
    }
  }
</style>
