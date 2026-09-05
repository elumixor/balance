<script lang="ts">
  import { progressData } from "$lib/planning/progress.svelte";
  import { settings } from "$lib/settings";
  import Tooltip from "./Tooltip.svelte";

  /**
   * The star count, drawn as a number on a star. One glyph in the app's one warm colour, next to
   * the avatar on every screen, and the way into the record behind it.
   *
   * `compact` is for the rail, where it lines up beside the window buttons and wants their scale.
   */
  let { compact = false }: { compact?: boolean } = $props();

  progressData.ensure();

  const stars = $derived(progressData.stars);
  const label = $derived(stars === null ? "" : stars >= 1000 ? `${Math.floor(stars / 1000)}k` : `${stars}`);
  /** Three digits still have to fit inside the star. */
  const fontSize = $derived(label.length >= 3 ? 0.34 : 0.42);
  const size = $derived(compact ? 22 : 28);
</script>

<Tooltip label="Stars and achievements">
  <button
    type="button"
    onclick={() => settings.show("stars")}
    aria-label={stars === null ? "Stars" : `${stars} stars`}
    class="press-sm relative flex shrink-0 items-center justify-center text-amber-400"
    style="width:{size}px;height:{size}px"
  >
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path
        d="M12 1.6l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 17.8l-6.4 3.5 1.4-7.2-5.3-5 7.2-.9z"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </svg>
    <span
      class="absolute inset-0 flex items-center justify-center pt-[18%] font-semibold text-ink-fg tabular-nums"
      style="font-size:{size * fontSize}px;line-height:1"
    >
      {label}
    </span>
  </button>
</Tooltip>
