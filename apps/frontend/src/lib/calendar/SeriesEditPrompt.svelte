<script lang="ts">
  import Button from "$lib/components/Button.svelte";
  import { calendarData } from "./calendar-data.svelte";
  import { fly } from "svelte/transition";

  /**
   * A repeating event was just edited on one occurrence. Offered from the bottom, Notion-style,
   * so the choice doesn't block the grid it's about — ⌘/Ctrl-dragging skips this on purpose by
   * detaching the occurrence up front, which is why there's no third "always ask" option here.
   */
  const data = calendarData;
  const prompt = $derived(data.seriesPrompt);
</script>

{#if prompt}
  <div
    class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    transition:fly={{ y: 16, duration: 180 }}
  >
    <div
      class="pointer-events-auto flex items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3 shadow-lg"
    >
      <p class="t-body max-w-[240px] truncate">
        Apply this change to every <span class="font-medium">{prompt.title || "event"}</span>?
      </p>
      <div class="flex shrink-0 gap-2">
        <Button label="Just this one" variant="outline" size="sm" onclick={() => data.dismissSeriesPrompt()} />
        <Button label="Whole series" size="sm" onclick={() => data.applyToSeries()} />
      </div>
    </div>
  </div>
{/if}
