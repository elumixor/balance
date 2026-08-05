<script lang="ts">
  import { withAlpha } from "$lib/colors";
  import Dot from "$lib/components/Dot.svelte";
  import type { CategoryTrend } from "$lib/types";

  /**
   * One bar per past period, the latest at full strength. The line is the target,
   * so a run of bars sitting under it reads as a habit, not an off week.
   */
  let { trend }: { trend: CategoryTrend } = $props();

  const last = $derived(trend.points.length - 1);
</script>

<div class="space-y-1 py-2">
  <div class="flex items-center gap-2">
    <Dot color={trend.color} size={7} />
    <span class="t-micro text-fg-muted">{trend.name}</span>
  </div>

  <div class="relative h-10">
    <div class="absolute inset-x-0 bottom-1/2 h-px bg-line"></div>
    <div class="flex h-full items-end gap-[3px]">
      {#each trend.points as point, i (point.periodStart)}
        {@const ratio =
          point.targetHours > 0 ? point.actualHours / point.targetHours : point.actualHours > 0 ? 2 : 0}
        <!-- The target line sits at half height, so a period on plan reaches it exactly. -->
        <div
          class="flex-1 rounded-sm"
          style="height:{Math.min(100, Math.max(3, ratio * 50))}%;background:{i === last
            ? trend.color
            : withAlpha(trend.color, 0.35)}"
        ></div>
      {/each}
    </div>
  </div>
</div>
