<script lang="ts">
  import { calendarData } from "./calendar-data.svelte";
  import { Repeat, Undo2, X } from "lucide-svelte";
  import { fly } from "svelte/transition";

  /**
   * A repeating event was just edited on one occurrence. Offered from the corner, in the same card
   * the failures use, so the choice doesn't block the grid it's about — ⌘/Ctrl-dragging skips this
   * on purpose by detaching the occurrence up front, which is why there's no third option here.
   *
   * Keyed on the offer's id: a second edit takes the first card away and brings its own, rather
   * than silently relabelling one that has been sitting there since the edit before.
   */
  const data = calendarData;
  const prompt = $derived(data.seriesPrompt);
</script>

{#key prompt?.id}
  {#if prompt}
    <div class="fixed right-3 bottom-3 z-50" transition:fly={{ y: 16, duration: 180 }}>
      <div
        class="flex items-center gap-0.5 rounded-xl border border-line-strong bg-surface py-1.5 pr-1.5 pl-2
          shadow-(--shadow-float)"
      >
        <button
          type="button"
          class="press-sm t-label flex items-center gap-1.5 rounded-md px-1.5 py-1 whitespace-nowrap"
          title="Apply this change to every occurrence"
          onclick={() => data.applyToSeries()}
        >
          <Repeat size={15} />
          Change all
        </button>
        <button
          type="button"
          class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
          aria-label="Undo this change"
          title="Undo this change"
          onclick={() => data.undoSeriesEdit()}
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
          aria-label="Just this one"
          title="Just this one"
          onclick={() => data.dismissSeriesPrompt()}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  {/if}
{/key}
