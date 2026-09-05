<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    onclick,
    /** Left undefined for plain actions; a boolean turns the row into a radio choice. */
    selected,
    tone = "default",
    icon,
  }: {
    label: string;
    onclick: () => void;
    selected?: boolean;
    tone?: "default" | "danger";
    icon?: Snippet;
  } = $props();
</script>

<button
  type="button"
  role={selected === undefined ? "menuitem" : "menuitemradio"}
  aria-checked={selected}
  {onclick}
  class="t-label flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-alt {tone === 'danger'
    ? 'text-danger'
    : 'text-fg'}"
>
  {#if icon}{@render icon()}{/if}
  <span class="flex-1">{label}</span>
  {#if selected}
    <span class="size-1.5 rounded-full bg-ink"></span>
  {/if}
</button>
