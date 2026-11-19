<script lang="ts">
  import { barOf } from "$lib/planning/sphere-tree";
  import type { SphereProgress } from "$lib/planning/types";

  /**
   * A sphere's week against its hours: what is already spent in its colour, what is still on the
   * calendar in a lighter shade of it, and the hours past its budget said in words beside it.
   */
  let { progress, color }: { progress: SphereProgress; color: string } = $props();

  const bar = $derived(barOf(progress));
  const fmt = (hours: number) => `${Math.round(hours * 10) / 10}`;
</script>

<div class="flex items-center gap-2">
  <div
    class="flex h-[3px] flex-1 overflow-hidden rounded-full bg-surface-alt"
    role="meter"
    aria-valuemin={0}
    aria-valuemax={progress.targetHours}
    aria-valuenow={bar.plannedHours}
    aria-label="Planned this week"
  >
    <div class="h-full" style:width="{bar.tracked * 100}%" style:background={color}></div>
    <div class="h-full opacity-40" style:width="{bar.scheduled * 100}%" style:background={color}></div>
  </div>
  <span class="t-micro shrink-0 tabular-nums text-fg-faint">
    {fmt(bar.plannedHours)} / {fmt(progress.targetHours)}h{#if bar.overHours > 0}<span class="text-danger"
        >&nbsp;· +{fmt(bar.overHours)}h over</span
      >{/if}
  </span>
</div>
{#if progress.warning}
  <p class="t-micro text-danger">{progress.warning}</p>
{/if}
