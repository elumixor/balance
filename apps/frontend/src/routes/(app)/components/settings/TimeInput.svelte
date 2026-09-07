<script lang="ts">
  /**
   * A time of day, in the platform's own picker, drawn the way a field sits in a row: no box
   * until it is pointed at or typed in.
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

<input type="time" {value} aria-label={label} onchange={(e) => onchange(e.currentTarget.value)} class="field-bare t-data" />
