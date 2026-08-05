<script lang="ts">
  import { swatchPalette } from "$lib/colors";
  import Arc from "./ring/Arc.svelte";

  /** The product's own artefact: a week, already divided. */
  const SHARES = [0.34, 0.22, 0.16, 0.28];

  let { size = 44 }: { size?: number } = $props();

  const thickness = $derived(size * 0.2);
  const arcs = $derived.by(() => {
    let cursor = 0;
    return SHARES.map((share, i) => {
      const start = cursor;
      cursor += share;
      return { start: start + 0.008, sweep: share - 0.016, color: swatchPalette[i * 2 + 1], delay: i * 90 };
    });
  });
</script>

<svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
  {#each arcs as arc, i (i)}
    <Arc
      cx={size / 2}
      cy={size / 2}
      r={size / 2 - thickness / 2}
      {thickness}
      color={arc.color}
      start={arc.start}
      sweep={arc.sweep}
      delay={arc.delay}
    />
  {/each}
</svg>
