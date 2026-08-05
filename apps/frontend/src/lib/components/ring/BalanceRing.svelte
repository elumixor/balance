<script lang="ts">
  import { withAlpha } from "$lib/colors";
  import type { BalanceSlice } from "$lib/types";
  import Arc from "./Arc.svelte";

  /**
   * Plan on the outside, reality on the inside. Each category keeps a fixed wedge
   * sized by its target, and the inner arc fills that wedge as the hours land —
   * short of the seam means behind, past the seam means the hours were borrowed
   * from whatever comes next.
   */
  let {
    slices,
    size = 236,
    centerValue,
    centerLabel,
  }: { slices: BalanceSlice[]; size?: number; centerValue: string; centerLabel: string } = $props();

  const planThickness = 9;
  const actualThickness = 17;
  const gap = 5;

  const c = $derived(size / 2);
  const rPlan = $derived(size / 2 - planThickness / 2);
  const rActual = $derived(rPlan - planThickness / 2 - gap - actualThickness / 2);

  const wedges = $derived.by(() => {
    const total = slices.reduce((sum, s) => sum + s.targetHours, 0) || 1;
    let cursor = 0;
    return slices.map((slice) => {
      const start = cursor;
      const width = slice.targetHours / total;
      cursor += width;
      const ratio = slice.targetHours > 0 ? slice.actualHours / slice.targetHours : 0;
      return { slice, start, width, ratio };
    });
  });
</script>

<div class="relative" style="width:{size}px;height:{size}px">
  <svg width={size} height={size} aria-hidden="true">
    <circle cx={c} cy={c} r={rActual} fill="none" stroke="var(--surface-alt)" stroke-width={actualThickness} />

    {#each wedges as wedge, i (`plan-${wedge.slice.id}`)}
      <Arc
        cx={c}
        cy={c}
        r={rPlan}
        thickness={planThickness}
        color={wedge.slice.color}
        opacity={0.5}
        start={wedge.start + 0.003}
        sweep={Math.max(0, wedge.width - 0.006)}
        delay={i * 40}
      />
    {/each}

    {#each wedges as wedge, i (`actual-${wedge.slice.id}`)}
      <Arc
        cx={c}
        cy={c}
        r={rActual}
        thickness={actualThickness}
        color={wedge.slice.color}
        start={wedge.start + 0.003}
        sweep={Math.max(0, Math.min(wedge.ratio, 1) * wedge.width - 0.006)}
        delay={220 + i * 40}
      />
    {/each}

    {#each wedges.filter((w) => w.ratio > 1.02) as wedge, i (`over-${wedge.slice.id}`)}
      <Arc
        cx={c}
        cy={c}
        r={rActual}
        thickness={actualThickness}
        color={withAlpha(wedge.slice.color, 0.45)}
        start={wedge.start + wedge.width}
        sweep={Math.min(wedge.ratio - 1, 0.6) * wedge.width}
        delay={420 + i * 40}
      />
    {/each}
  </svg>

  <div class="pointer-events-none absolute inset-y-0 left-12 right-12 flex flex-col items-center justify-center gap-1">
    <span class="t-data-strong truncate">{centerValue}</span>
    <span class="t-micro text-center text-fg-muted">{centerLabel}</span>
  </div>
</div>
