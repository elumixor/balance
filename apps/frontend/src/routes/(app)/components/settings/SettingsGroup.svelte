<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * One group of settings on a page: a heading, and the controls under it.
   *
   * No card, no border, no icon. A settings pane is a document — headings and the things they
   * govern, separated by a hairline — and boxing each group drew five rectangles whose only job
   * was to repeat what the whitespace already said.
   */
  let {
    title,
    divided = true,
    children,
  }: { title: string; note?: string; divided?: boolean; children: Snippet } = $props();
</script>

<section class={divided ? "border-t border-line pt-7" : ""}>
  <h3 class="t-body-strong mb-3 text-fg">{title}</h3>
  <div class="space-y-4">
    {@render children()}
  </div>
</section>
