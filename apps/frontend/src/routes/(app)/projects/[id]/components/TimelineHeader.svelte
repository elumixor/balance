<script lang="ts">
  import { periodsOf, type Scale, type Span, ticksOf } from "$lib/projects/gantt";
  import { NAME_WIDTH } from "$lib/projects/timeline.svelte";

  /**
   * The two rows above the grid: the months (or years) a stretch of columns belongs to, and the
   * columns themselves. Today is the only strong mark on either — a filled disc under the number,
   * with the line that runs down the grid coming out of it.
   */
  let {
    window: bounds,
    scale,
    today,
    width,
  }: { window: Span; scale: Scale; today: string; width: number } = $props();

  const periods = $derived(periodsOf(bounds, scale));
  const ticks = $derived(ticksOf(bounds, scale, today));
</script>

<div class="sticky top-0 z-20 flex bg-surface">
  <div class="sticky left-0 z-10 shrink-0 border-r border-b border-line bg-surface" style="width:{NAME_WIDTH}px"></div>
  <div class="relative border-b border-line" style="width:{width}px;height:46px">
    {#each periods as period (period.key)}
      <span
        class="t-micro absolute top-0 flex h-6 items-center truncate border-l border-line pl-2 text-fg-muted"
        style="left:{period.left}px;width:{period.width}px"
      >
        {period.label}
      </span>
    {/each}

    {#each ticks as tick (tick.key)}
      <span
        class="t-data-micro absolute bottom-0 flex h-5 items-center justify-center
          {tick.weekend ? 'bg-surface-alt' : ''} {tick.today ? 'text-fg' : 'text-fg-faint'}"
        style="left:{tick.left}px;width:{tick.width}px"
      >
        {#if tick.today}
          <span class="flex min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-ink-fg">
            {tick.label}
          </span>
        {:else}
          <span class="truncate px-1">{tick.label}</span>
        {/if}
      </span>
    {/each}
  </div>
</div>
