<script lang="ts">
  import type { Icon as IconType } from "lucide-svelte";
  import type { Snippet } from "svelte";

  /**
   * One line of the event card: a glyph on its own small ground, then whatever the line says.
   *
   * Every row is this, whether it is a button that opens a picker, a field being typed into, or
   * a list of guests — so the card reads as one column of glyphs with one column of words beside
   * it, and a new kind of row can't arrive with its own idea of spacing. A row with `onclick` is
   * a button and lights up under the pointer; the rest lie flat and let their fields light up.
   */
  let {
    icon,
    /** Whether the row holds something — set rows read in ink, empty ones recede. */
    set = false,
    label,
    /** "start" for a row whose content runs to several lines, so the glyph sits by the first. */
    align = "center",
    onclick,
    disabled = false,
    children,
  }: {
    icon: typeof IconType;
    set?: boolean;
    label?: string;
    align?: "center" | "start";
    onclick?: (e: MouseEvent & { currentTarget: HTMLButtonElement }) => void;
    disabled?: boolean;
    children?: Snippet;
  } = $props();

  const Icon = $derived(icon);
  const classes = $derived(
    `flex w-full gap-3 rounded-md px-1.5 py-1 text-left ${align === "start" ? "items-start" : "items-center"}`,
  );
</script>

{#snippet glyph()}
  <span
    class="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-alt {set
      ? 'text-fg-muted'
      : 'text-fg-faint'} {align === 'start' ? 'mt-0.5' : ''}"
  >
    <Icon size={15} />
  </span>
{/snippet}

{#snippet body()}
  {#if children}
    {@render children()}
  {:else}
    <span class="t-label min-w-0 flex-1 truncate {set ? 'text-fg' : 'text-fg-faint'}">{label}</span>
  {/if}
{/snippet}

{#if onclick}
  <button type="button" {onclick} {disabled} class="{classes} press-sm hoverable">
    {@render glyph()}
    {@render body()}
  </button>
{:else}
  <div class={classes}>
    {@render glyph()}
    {@render body()}
  </div>
{/if}
