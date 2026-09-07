<script lang="ts">
  import type { Icon as IconType } from "lucide-svelte";
  import type { Snippet } from "svelte";

  /**
   * One line of settings: a glyph, the words, and at the far end the control.
   *
   * The same shape as a row of the event card, so the panel reads as one column of glyphs with
   * one column of words beside it, and a switch, a time, a trash can and a Connect button all sit
   * on the same vertical line. A row with `onclick` lights up whole under the pointer — the words
   * are the target — and the control, if any, stays its own.
   */
  let {
    icon,
    label,
    /** One faint line where the label alone doesn't say enough. Most rows need none; a snippet
     *  for the rare line with a hover or a link in it. */
    note,
    /** Dimmed and inert for a setting that only means something when another one is on. */
    disabled = false,
    onclick,
    children,
  }: {
    icon?: typeof IconType;
    label: string;
    note?: string | Snippet;
    disabled?: boolean;
    onclick?: () => void;
    children?: Snippet;
  } = $props();

  const Icon = $derived(icon);
</script>

{#snippet words()}
  <span class="flex size-7 shrink-0 items-center justify-center text-fg-muted">
    {#if Icon}<Icon size={16} />{/if}
  </span>
  <span class="min-w-0 flex-1">
    <span class="t-label block truncate text-fg">{label}</span>
    {#if typeof note === "function"}
      <span class="t-micro block text-fg-faint">{@render note()}</span>
    {:else if note}
      <span class="t-micro block text-fg-faint">{note}</span>
    {/if}
  </span>
{/snippet}

<div class="flex min-h-9 items-center gap-3 rounded-md px-1.5 py-1 {disabled ? 'pointer-events-none opacity-40' : ''}">
  {#if onclick}
    <button type="button" {onclick} class="press-sm -mx-1.5 -my-1 flex min-w-0 flex-1 items-center gap-3 rounded-md px-1.5 py-1 text-left hoverable">
      {@render words()}
    </button>
  {:else}
    {@render words()}
  {/if}
  {#if children}
    <span class="flex shrink-0 items-center gap-2">{@render children()}</span>
  {/if}
</div>
