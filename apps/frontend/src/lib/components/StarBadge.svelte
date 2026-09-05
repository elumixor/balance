<script lang="ts">
  import { progressData } from "$lib/planning/progress.svelte";
  import { settings } from "$lib/settings";
  import StarGlyph from "./StarGlyph.svelte";
  import Tooltip from "./Tooltip.svelte";

  /**
   * The star count, drawn as a number on the star. The same glyph as everywhere else, in ink,
   * with the count knocked out of it — next to the avatar on every screen, and the way into the
   * record behind it.
   *
   * `compact` is for the rail, where it lines up beside the window buttons and wants their scale.
   */
  let { compact = false }: { compact?: boolean } = $props();

  progressData.ensure();

  const stars = $derived(progressData.stars);
  const label = $derived(stars === null ? "" : stars >= 1000 ? `${Math.floor(stars / 1000)}k` : `${stars}`);
  /** Three digits still have to fit inside the star. */
  const fontSize = $derived(label.length >= 3 ? 0.3 : 0.38);
  const size = $derived(compact ? 22 : 28);
</script>

<Tooltip label="Stars and achievements">
  <button
    type="button"
    onclick={() => settings.show("stars")}
    aria-label={stars === null ? "Stars" : `${stars} stars`}
    class="press-sm hoverable relative flex shrink-0 items-center justify-center rounded-md"
    style="width:{size + 4}px;height:{size + 4}px"
  >
    <StarGlyph {size} />
    <!-- Knocked out of the star: the page colour, so it reads as a cut rather than a label. -->
    <span
      class="absolute inset-0 flex items-center justify-center pt-[14%] font-semibold text-ink-fg"
      style="font-size:{size * fontSize}px;line-height:1"
    >
      {label}
    </span>
  </button>
</Tooltip>
