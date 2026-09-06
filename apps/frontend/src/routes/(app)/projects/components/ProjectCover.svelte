<script lang="ts">
  import { CategoryIcon } from "$lib/components";
  import { restColor } from "$lib/ui/colors";
  import { DEFAULT_ICON } from "$lib/ui/icons/index";
  import type { Category } from "$lib/core/records";

  /**
   * What a project looks like at a glance: its art, its logo, an emoji — or, with none of those,
   * its sphere's own icon, so a card with nothing chosen still belongs to the sphere it sits under.
   */
  let {
    cover,
    category,
    size = 44,
  }: { cover: string | null; category: Category | null; size?: number } = $props();

  const isImage = $derived(Boolean(cover && /^(https?:\/\/|data:)/.test(cover)));
</script>

{#if cover && isImage}
  <img
    src={cover}
    alt=""
    style="width:{size}px;height:{size}px"
    class="shrink-0 rounded-md border border-line object-cover"
  />
{:else if cover}
  <span
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.55)}px"
    class="flex shrink-0 items-center justify-center rounded-md bg-surface-alt leading-none"
  >
    {cover}
  </span>
{:else}
  <CategoryIcon icon={category?.icon ?? DEFAULT_ICON} color={category?.color ?? restColor} {size} />
{/if}
