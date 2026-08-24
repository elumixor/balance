<script lang="ts">
  import type { Icon as IconType } from "lucide-svelte";
  import type { Snippet } from "svelte";

  /**
   * One group of settings, as a card.
   *
   * The panel used to be a single column of headings and paragraphs, which made every section
   * look like the same amount of reading. A card with a glyph on it can be found without being
   * read — you come here to change the evening time, and the clock face is what you're looking
   * for, not the word "Planning".
   *
   * The header carries the section's own switch where it has one, because a section that is off
   * is off as a whole, and repeating "Ask me to plan" as its first row said it twice.
   */
  let {
    icon: Icon,
    title,
    /** One line at most. Anything longer belongs on a row's own tooltip. */
    note,
    trailing,
    children,
  }: {
    icon: typeof IconType;
    title: string;
    note?: string;
    trailing?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="rounded-lg border border-line bg-surface">
  <header class="flex min-h-11 items-center gap-2.5 px-4 pt-3 pb-2">
    <Icon size={16} class="shrink-0 text-fg-muted" />
    <h3 class="t-label flex-1 text-fg">{title}</h3>
    {#if trailing}{@render trailing()}{/if}
  </header>
  {#if note}
    <p class="t-micro px-4 pb-2 text-fg-faint">{note}</p>
  {/if}
  <div class="px-4 pt-1 pb-3">
    {@render children()}
  </div>
</section>
