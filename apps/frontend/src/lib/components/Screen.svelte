<script lang="ts">
  import type { Snippet } from "svelte";
  import AccountButton from "./AccountButton.svelte";
  import ThemeToggle from "./ThemeToggle.svelte";

  /**
   * The frame every screen sits in. It owns the one thing a phone layout forgets: a measure.
   * Content stops growing at a readable width and centres in whatever room is left, so a
   * 27-inch window shows a column rather than a stretched phone.
   *
   * The title scrolls away with the content instead of living in a fixed bar — on a wide
   * screen the side rail already says where you are.
   */
  let {
    title,
    subtitle,
    /** For screens whose ring sits beside its list at `xl` — see SplitPane. */
    wide = false,
    children,
  }: { title: string; subtitle?: string; wide?: boolean; children: Snippet } = $props();
</script>

<!-- The scroll lives here rather than on the shell, so a screen can opt out of it entirely. -->
<div
  class="safe-top mx-auto h-full w-full overflow-y-auto px-5 pt-4 pb-10 md:px-10 md:pt-10 md:pb-16 {wide
    ? 'max-w-5xl'
    : 'max-w-2xl'}"
>
  <header class="mb-5 flex items-start justify-between gap-3 md:mb-8">
    <div class="flex-1 space-y-0.5">
      <h1 class="t-title">{title}</h1>
      {#if subtitle}
        <p class="t-label text-fg-muted">{subtitle}</p>
      {/if}
    </div>
    <!-- Account and appearance move into the side rail as soon as there is one. -->
    <div class="flex items-center gap-1.5 md:hidden">
      <ThemeToggle />
      <AccountButton />
    </div>
  </header>

  {@render children()}
</div>
