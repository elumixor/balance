<script lang="ts">
  import { progressData } from "$lib/planning/progress.svelte";
  import { settings } from "$lib/settings";
  import StarGlyph from "./StarGlyph.svelte";
  import Tooltip from "./Tooltip.svelte";

  /**
   * The star count, as a pill: the glyph and the number side by side, on the same quiet ground
   * as every other pill in the app — next to the avatar on every screen, and the way into the
   * record behind it.
   *
   * `compact` is for the rail, where it lines up beside the window buttons and wants their scale.
   */
  let { compact = false }: { compact?: boolean } = $props();

  progressData.ensure();

  const stars = $derived(progressData.stars);
  const label = $derived(stars === null ? "" : stars >= 10_000 ? `${Math.floor(stars / 1000)}k` : `${stars}`);
</script>

<Tooltip label="Stars and achievements">
  <button
    type="button"
    onclick={() => settings.show("general")}
    aria-label={stars === null ? "Stars" : `${stars} stars`}
    class="press-sm hoverable flex shrink-0 items-center rounded-full bg-surface-alt text-fg {compact
      ? 'h-[18px] gap-1 pr-1.5 pl-1'
      : 'h-7 gap-1 pr-2.5 pl-2'}"
  >
    <StarGlyph size={compact ? 11 : 14} />
    <!-- `leading-none` on the number, or the line box of the text rung sits it a hair below the glyph. -->
    {#if label}
      <span class="{compact ? 't-micro' : 't-label'} leading-none! tabular-nums">{label}</span>
    {/if}
  </button>
</Tooltip>
