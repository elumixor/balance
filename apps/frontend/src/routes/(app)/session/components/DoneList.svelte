<script lang="ts">
  import { CategoryIcon } from "$lib/components";
  import type { SessionBlock } from "$lib/planning/types";
  import { Check } from "lucide-svelte";

  /**
   * Everything the day held, ticked. A block that was given a category is a task done; one that
   * wasn't is still listed — it happened — but without the tick, which is the only difference
   * between them on this screen.
   */
  let { blocks }: { blocks: readonly SessionBlock[] } = $props();

  const SHOWN = 8;
  const shown = $derived(blocks.slice(0, SHOWN));
  const more = $derived(blocks.length - shown.length);

  function hours(value: number) {
    return `${Math.round(value * 10) / 10}h`;
  }
</script>

<ul class="divide-y divide-line rounded-xl border border-line bg-surface px-3">
  {#each shown as block, index (block.id)}
    {@const done = block.categoryId !== null}
    <li class="list-item-in flex items-center gap-3 py-2.5" style="animation-delay:{index * 45}ms">
      <span
        class="flex size-5 shrink-0 items-center justify-center rounded-full {done
          ? 'bg-ink text-ink-fg'
          : 'border border-line-strong'}"
      >
        {#if done}<Check size={12} strokeWidth={3} />{/if}
      </span>
      {#if block.icon && block.color}
        <CategoryIcon icon={block.icon} color={block.color} size={14} />
      {/if}
      <span class="t-label min-w-0 flex-1 truncate {done ? '' : 'text-fg-muted'}">{block.title}</span>
      <span class="t-data-compact text-fg-muted">{hours(block.hours)}</span>
    </li>
  {/each}
  {#if more > 0}
    <li class="py-2.5">
      <a href="/calendar" class="t-micro text-fg-faint">And {more} more on the calendar</a>
    </li>
  {/if}
</ul>
