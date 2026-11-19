<script lang="ts">
  import { weekTotals } from "$lib/planning/sphere-tree";
  import type { SphereProgress } from "$lib/planning/types";

  /** The whole week at a glance: the hours the spheres hold this week against what they are owed. */
  let { spheres }: { spheres: SphereProgress[] } = $props();

  const SIZE = 44;
  const STROKE = 5;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;

  const totals = $derived(weekTotals(spheres));
  const planned = $derived(Math.round((totals.trackedHours + totals.scheduledHours) * 10) / 10);
  const scale = $derived(Math.max(planned, totals.targetHours));
  const tracked = $derived(scale > 0 ? totals.trackedHours / scale : 0);
  const scheduled = $derived(scale > 0 ? totals.scheduledHours / scale : 0);
  const over = $derived(planned > totals.targetHours);
</script>

<div class="flex items-center gap-3">
  <svg width={SIZE} height={SIZE} viewBox="0 0 {SIZE} {SIZE}" class="-rotate-90 shrink-0" aria-hidden="true">
    <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--color-surface-alt)" stroke-width={STROKE} />
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={R}
      fill="none"
      stroke="var(--color-fg-muted)"
      stroke-opacity="0.35"
      stroke-width={STROKE}
      stroke-dasharray="{(tracked + scheduled) * C} {C}"
    />
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={R}
      fill="none"
      stroke="var(--color-fg-muted)"
      stroke-width={STROKE}
      stroke-dasharray="{tracked * C} {C}"
    />
  </svg>
  <p class="t-micro tabular-nums text-fg-faint">
    <span class={over ? "text-danger" : "text-fg-muted"}>{planned}h</span> of {totals.targetHours}h planned this week
    <br />{totals.trackedHours}h done
  </p>
</div>
