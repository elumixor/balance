<script lang="ts">
  import CategoryIcon from "./CategoryIcon.svelte";
  import { restColor } from "$lib/ui/colors";
  import { DEFAULT_ICON } from "$lib/ui/icons";
  import type { Category } from "$lib/core/records";

  /**
   * What a project looks like at a glance: the emoji it carries — Notion's own, when it came from
   * there — or, with none, its sphere's icon, so a project with nothing chosen still belongs to
   * the sphere it sits under.
   */
  let { icon, category, size = 44 }: { icon: string | null; category: Category | null; size?: number } = $props();
</script>

{#if icon}
  <span
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.55)}px"
    class="flex shrink-0 items-center justify-center rounded-md bg-surface-alt leading-none"
  >
    {icon}
  </span>
{:else}
  <CategoryIcon icon={category?.icon ?? DEFAULT_ICON} color={category?.color ?? restColor} {size} />
{/if}
