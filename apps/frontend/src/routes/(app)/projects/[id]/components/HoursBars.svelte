<script lang="ts">
  import { formatHoursDecimal } from "$lib/format";
  import { formatDayKey } from "$lib/projects/decide-on";

  /**
   * The last eight weeks of a project's hours as bars, with the claim drawn across them as a
   * rule: a bar reaching the rule is a week the claim was kept. The bars are the calendar's
   * answer, the rule is the promise, and the gap between them is the whole point of the chart.
   */
  let {
    weeks,
    hours,
    claimed,
    color,
    height = 40,
  }: { weeks: readonly string[]; hours: readonly number[]; claimed: number; color: string; height?: number } = $props();

  const max = $derived(Math.max(claimed, ...hours, 1));
  const rule = $derived((1 - claimed / max) * 100);
</script>

<div class="space-y-1">
  <div class="relative flex items-end gap-1" style="height:{height}px">
    {#each hours as h, i (weeks[i] ?? i)}
      {@const ratio = h / max}
      <div
        class="flex-1 rounded-t-sm"
        title="{weeks[i] ? formatDayKey(weeks[i]) : ''}: {formatHoursDecimal(h)}"
        style="height:{Math.max(2, ratio * 100)}%;background:{color};opacity:{i === hours.length - 1 ? 1 : 0.55}"
      ></div>
    {/each}
    {#if claimed > 0}
      <div class="pointer-events-none absolute inset-x-0 border-t border-dashed border-fg/40" style="top:{rule}%"></div>
    {/if}
  </div>
  <div class="flex justify-between">
    <span class="t-micro text-fg-faint">{weeks[0] ? formatDayKey(weeks[0]) : ""}</span>
    <span class="t-micro text-fg-faint">{claimed > 0 ? `${formatHoursDecimal(claimed)}/wk claimed` : "no claim"}</span>
  </div>
</div>
