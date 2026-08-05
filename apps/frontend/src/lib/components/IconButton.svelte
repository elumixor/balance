<script lang="ts">
  import type { Snippet } from "svelte";

  /** Icon-only controls always need a screen-reader name, hence the required label. */
  let {
    label,
    onclick,
    children,
    tone = "muted",
  }: { label: string; onclick: () => void; children: Snippet; tone?: "muted" | "plain" } = $props();
</script>

<button
  type="button"
  {onclick}
  aria-label={label}
  class="press-sm flex size-8 shrink-0 items-center justify-center rounded-md {tone === 'plain'
    ? ''
    : 'bg-surface-alt'}"
>
  {@render children()}
</button>
