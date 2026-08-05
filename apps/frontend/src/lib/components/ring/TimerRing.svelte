<script lang="ts">
  import type { Split } from "$lib/types";
  import type { Snippet } from "svelte";
  import Arc, { pointOnRing } from "./Arc.svelte";

  /**
   * While a timer runs, the ring shows where those minutes are going — the running
   * activity's category mix — and a single ink hand sweeps it once an hour, so the
   * card is visibly alive without a spinner.
   */
  let {
    splits,
    elapsedMs,
    size = 150,
    thickness = 10,
    children,
  }: { splits: Split[]; elapsedMs: number; size?: number; thickness?: number; children?: Snippet } = $props();

  const cx = $derived(size / 2);
  const r = $derived(size / 2 - thickness / 2);

  const arcs = $derived.by(() => {
    const total = splits.reduce((sum, s) => sum + s.value, 0) || 1;
    let cursor = 0;
    return splits
      .filter((s) => s.value > 0)
      .map((split) => {
        const start = cursor / total;
        cursor += split.value;
        return { split, start, sweep: split.value / total };
      });
  });

  const hand = $derived(pointOnRing(cx, cx, r, (((elapsedMs / 3_600_000) % 1) + 1) % 1));
</script>

<div class="relative" style="width:{size}px;height:{size}px">
  <svg width={size} height={size} aria-hidden="true">
    <circle cx={cx} cy={cx} {r} fill="none" stroke="var(--surface-alt)" stroke-width={thickness} />
    {#each arcs as arc, i (arc.split.id)}
      <Arc
        cx={cx}
        cy={cx}
        {r}
        {thickness}
        color={arc.split.color}
        start={arc.start + 0.004}
        sweep={Math.max(0, arc.sweep - 0.008)}
        delay={i * 45}
      />
    {/each}
    <circle cx={hand.x} cy={hand.y} r={thickness / 2 + 1.5} fill="var(--ink)" stroke="var(--surface)" stroke-width="2" />
  </svg>
  <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
    {#if children}{@render children()}{/if}
  </div>
</div>
