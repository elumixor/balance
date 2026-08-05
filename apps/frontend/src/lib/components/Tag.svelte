<script lang="ts">
  import { withAlpha } from "$lib/colors";

  /** A read-only marker for a category share; colour comes from the category itself. */
  let { label, color }: { label: string; color: string } = $props();
</script>

<span class="t-micro rounded-sm px-2 py-[3px]" style="background:{withAlpha(color, 0.12)};color:{color}">
  {label}
</span>
