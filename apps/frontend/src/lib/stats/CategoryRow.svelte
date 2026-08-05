<script lang="ts">
  import DeviationBar from "$lib/components/DeviationBar.svelte";
  import Dot from "$lib/components/Dot.svelte";
  import { formatHoursAndMinutes } from "$lib/format";
  import type { CategoryStat } from "$lib/types";

  let { stat }: { stat: CategoryStat } = $props();

  const ratio = $derived(
    stat.targetHours > 0 ? stat.actualHours / stat.targetHours : stat.actualHours > 0 ? 2 : 0,
  );
  const tone = $derived(
    stat.status === "on-target" ? "text-positive" : stat.status === "over" ? "text-caution" : "text-fg-muted",
  );
</script>

<div class="space-y-2 py-3">
  <div class="flex items-center gap-2">
    <Dot color={stat.color} size={9} />
    <span class="t-body-strong flex-1 truncate">{stat.name}</span>
    <span class="t-data">{formatHoursAndMinutes(stat.actualHours)}</span>
    <span class="t-data-micro text-fg-faint">/{formatHoursAndMinutes(stat.targetHours)}</span>
  </div>

  <DeviationBar {ratio} color={stat.color} />

  <div class="flex items-center gap-2">
    <span class="t-data-micro {tone}">
      {stat.diffHours >= 0 ? "+" : "−"}{formatHoursAndMinutes(Math.abs(stat.diffHours))}{stat.status === "on-target"
        ? " on plan"
        : stat.status === "over"
          ? " over"
          : " short"}
    </span>
    <span class="t-micro flex-1 truncate text-right text-fg-faint">
      {stat.breakdown
        .slice(0, 3)
        .map((b) => `${b.activityName} ${formatHoursAndMinutes(b.hours)}`)
        .join("  ·  ")}
    </span>
  </div>
</div>
