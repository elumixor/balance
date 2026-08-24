<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * A setting whose answer is a value rather than a yes: a time, a day, a number of minutes.
   *
   * The control sits under its label rather than across the row from it. At a rail's width there
   * is no room for both on one line, and a label pinned left with its value pinned right is a row
   * you have to read twice — once to find the words, once to find what they are set to.
   */
  let {
    label,
    note,
    disabled = false,
    control,
  }: { label: string; note?: string; disabled?: boolean; control: Snippet } = $props();
</script>

<div class={disabled ? "pointer-events-none opacity-40" : ""}>
  <p class="t-body mb-1.5 text-fg">{label}</p>
  {@render control()}
  {#if note}<p class="t-micro mt-1.5 text-fg-faint">{note}</p>{/if}
</div>
