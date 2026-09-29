<script lang="ts">
  import type { Icon as IconType } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import Skeleton from "./Skeleton.svelte";

  /**
   * One question of a form: a small label with its glyph, and the control under it — or a bar
   * where the control will be while what it offers is still being read.
   */
  let {
    icon: Icon,
    label,
    loading = false,
    children,
  }: { icon: typeof IconType; label: string; loading?: boolean; children: Snippet } = $props();

  const CONTROL_HEIGHT = 40;
</script>

<div class="space-y-1.5">
  <span class="t-micro flex items-center gap-1.5 text-fg-muted"><Icon size={12} />{label}</span>
  {#if loading}
    <Skeleton height={CONTROL_HEIGHT} radius={6} />
  {:else}
    {@render children()}
  {/if}
</div>
