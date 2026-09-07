<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * One section of the settings page: a heading, and the rows under it.
   *
   * No card, no border, no icon. The page is a document — headings and the rows they govern,
   * separated by a hairline — and boxing each group drew rectangles whose only job was to repeat
   * what the whitespace already said. Rows inside are `SettingRow`s, a hairline between subgroups.
   */
  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section>
  <h3 class="t-body-strong mb-3 px-1.5 text-fg">{title}</h3>
  <div class="space-y-4">
    {@render children()}
  </div>
</section>
