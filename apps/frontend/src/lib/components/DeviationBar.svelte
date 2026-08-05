<script lang="ts">
  import { withAlpha } from "$lib/colors";

  /**
   * Zero sits in the middle: the bar grows left when a category is short of its
   * target and right when it ran over, so a balanced week reads as a quiet centre
   * line rather than a row of near-full progress bars.
   */
  let { ratio, color, height = 6 }: { ratio: number; color: string; height?: number } = $props();

  // ±100% of target maps to the full half-width; beyond that the bar pins.
  const offset = $derived(Math.max(-1, Math.min(1, ratio - 1)));
  const magnitude = $derived(Math.abs(offset) * 50);
</script>

<div class="relative overflow-hidden rounded-sm bg-surface-alt" style="height:{height}px">
  <div
    class="absolute inset-y-0"
    style="left:{offset < 0 ? 50 - magnitude : 50}%;width:{magnitude}%;background:{offset < 0
      ? withAlpha(color, 0.55)
      : color}"
  ></div>
  <div class="absolute inset-y-0 left-1/2 w-px bg-line-strong"></div>
</div>
