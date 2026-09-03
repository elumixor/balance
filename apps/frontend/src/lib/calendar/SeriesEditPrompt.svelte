<script lang="ts">
  import { calendarData } from "./calendar-data.svelte";
  import { X } from "lucide-svelte";
  import { fly } from "svelte/transition";

  /**
   * A repeating event was just edited on one occurrence. Offered from the corner, in the same card
   * the failures use, so the choice doesn't block the grid it's about — ⌘/Ctrl-dragging skips this
   * on purpose by detaching the occurrence up front, which is why there's no third option here.
   */
  const data = calendarData;
  const prompt = $derived(data.seriesPrompt);
</script>

{#if prompt}
  <div class="fixed right-3 bottom-3 z-50" transition:fly={{ y: 16, duration: 180 }}>
    <div
      class="flex items-center gap-0.5 rounded-xl border border-line-strong bg-surface py-1.5 pr-1.5 pl-3
        shadow-(--shadow-float)"
    >
      <button
        type="button"
        class="press-sm t-label rounded-md px-1 py-0.5 whitespace-nowrap"
        title="Apply this change to every occurrence"
        onclick={() => data.applyToSeries()}
      >
        Change all
      </button>
      <button
        type="button"
        class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
        aria-label="Just this one"
        onclick={() => data.dismissSeriesPrompt()}
      >
        <X size={15} />
      </button>
    </div>
  </div>
{/if}
