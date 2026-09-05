<script lang="ts">
  import { progressData } from "$lib/planning/progress.svelte";
  import { settings } from "$lib/settings";
  import StarCount from "./StarCount.svelte";
  import StarGlyph from "./StarGlyph.svelte";
  import Tooltip from "./Tooltip.svelte";

  /**
   * The star count next to the avatar on every screen, and the way into the record behind it.
   * The same pill as every other count; `compact` is for the rail, where it lines up beside the
   * window buttons and wants their scale.
   */
  let { compact = false }: { compact?: boolean } = $props();

  progressData.ensure();

  const stars = $derived(progressData.stars);
</script>

<Tooltip label="Stars and achievements">
  <button
    type="button"
    onclick={() => settings.show("general")}
    aria-label={stars === null ? "Stars" : `${stars} stars`}
    class="press-sm hoverable flex shrink-0 items-center rounded-full"
  >
    {#if stars === null}
      <span class="flex items-center rounded-full bg-surface-alt {compact ? 'p-1' : 'px-2 py-1.5'}">
        <StarGlyph size={compact ? 11 : 14} />
      </span>
    {:else}
      <StarCount value={stars} signed={false} size={compact ? 11 : 14} />
    {/if}
  </button>
</Tooltip>
