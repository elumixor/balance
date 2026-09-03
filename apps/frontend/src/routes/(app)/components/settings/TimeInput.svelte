<script lang="ts">
  /**
   * A time of day, in the platform's own picker.
   *
   * `<input type="time">` rather than the calendar's `TimeField`: that one exists to give an event
   * a duration from either end, and none of that means anything for "when should the evening
   * reminder arrive". A phone shows its wheel here, which is the control people already know.
   */
  let {
    value,
    label,
    onchange,
  }: { value: string; label: string; onchange: (value: string) => void } = $props();
</script>

<input
  type="time"
  {value}
  aria-label={label}
  onchange={(e) => onchange(e.currentTarget.value)}
  class="t-body rounded-md border border-line-strong bg-surface px-2 py-1 tabular-nums"
/>
