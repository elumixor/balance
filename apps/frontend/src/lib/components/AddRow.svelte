<script lang="ts">
  import { Plus } from "lucide-svelte";
  import Divider from "./Divider.svelte";

  /**
   * Adding is always the last row of its list, never a floating button — so the shape of
   * the list itself tells you where new things will land.
   */
  let {
    label,
    onclick,
    disabled = false,
    /** Lines the icon up with rows that lead with a swatch column. */
    indent = false,
  }: { label: string; onclick: () => void; disabled?: boolean; indent?: boolean } = $props();
</script>

<Divider />
<button
  type="button"
  {onclick}
  {disabled}
  aria-label={label}
  class="press hoverable -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-3"
>
  <span class="flex justify-center {indent ? 'w-8' : ''}">
    <Plus size={16} class="text-fg-muted" />
  </span>
  <span class="t-label text-fg-muted">{label}</span>
</button>
