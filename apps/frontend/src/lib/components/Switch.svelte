<script lang="ts">
  /**
   * On or off, for the settings that are one thing rather than a choice between several — where a
   * Segmented control would be two words pretending to be a decision.
   *
   * The track carries the state on its own, without a tick or a label inside it, so a column of
   * these reads as a column and the eye can find the one that's out of line.
   */
  let {
    checked,
    label,
    /** Dimmed and inert for a setting that only means something when another one is on. */
    disabled = false,
    onchange,
  }: { checked: boolean; label: string; disabled?: boolean; onchange: (checked: boolean) => void } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => onchange(!checked)}
  class="press-sm flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors
    duration-150 {disabled ? 'opacity-40' : ''} {checked ? 'border-ink bg-ink' : 'border-line bg-surface-alt'}"
>
  <!-- The knob is exactly the height of the track's inside, so "on" lands flush against its end. -->
  <span
    class="size-4 rounded-full transition-transform duration-150 {checked
      ? 'translate-x-4 bg-ink-fg'
      : 'translate-x-0 bg-fg-faint'}"
  ></span>
</button>
