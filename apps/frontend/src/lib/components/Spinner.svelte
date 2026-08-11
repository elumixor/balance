<script lang="ts">
  /**
   * A ring turning, for work happening behind something already on screen. It borrows the
   * current text colour and is deliberately faint: it reports, it doesn't ask.
   */
  let { size = 12 }: { size?: number } = $props();
</script>

<!-- Decorative: whatever it sits on carries `aria-busy`, which is the same news said once. -->
<span
  aria-hidden="true"
  class="inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent opacity-60"
  style="width: {size}px; height: {size}px; border-width: {Math.max(1.5, size / 8)}px;"
></span>
