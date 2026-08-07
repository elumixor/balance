<script lang="ts">
  /**
   * How much of a target is claimed: empty at nothing, full at the target, and no further —
   * an overrun turns the bar red rather than growing it, because past full there is nothing
   * left to show.
   */
  let { ratio, color, height = 4 }: { ratio: number; color: string; height?: number } = $props();

  const filled = $derived(Math.max(0, Math.min(1, ratio || 0)) * 100);
  const over = $derived(ratio > 1);
</script>

<div class="relative overflow-hidden rounded-sm bg-surface-alt" style="height:{height}px">
  <div class="absolute inset-y-0 left-0" style="width:{filled}%;background:{over ? 'var(--danger)' : color}"></div>
</div>
