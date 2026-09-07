<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { Category } from "$lib/core/records";
  import { Calendar } from "lucide-svelte";
  import SeriesPrompt from "./SeriesPrompt.svelte";

  /**
   * A repeating event was just edited on one occurrence. Asked beside that occurrence, after the
   * fact: just this one — which has already happened, so it is the default — this one and the
   * ones after it, or the whole series. Cancel is the one way back: it takes the edit off this
   * occurrence too. ⌘/Ctrl-dragging skips this on purpose by detaching the occurrence up front.
   *
   * Keyed on the offer's id: a second edit takes the first card away and brings its own, rather
   * than silently relabelling one that has been sitting there since the edit before.
   */
  let { categories }: { categories: Map<string, Category> } = $props();

  const data = calendarData;
  const prompt = $derived(data.seriesPrompt);

  function choose(scope: "instance" | "following" | "all") {
    if (scope === "instance") data.dismissSeriesPrompt();
    else void data.applyToSeries(scope);
  }
</script>

{#key prompt?.id}
  {#if prompt}
    <SeriesPrompt
      heading="Changed “{prompt.title || 'Untitled'}” — a repeating event"
      event={{ id: prompt.ref.id, seriesId: prompt.seriesId, start: prompt.fields.start.toISOString() }}
      {categories}
      icon={Calendar}
      hints={[
        "Keep the change on this occurrence only",
        "Apply this change to this and every later occurrence",
        "Apply this change to every occurrence",
        "Undo this change",
      ]}
      onchoose={choose}
      oncancel={() => void data.undoSeriesEdit()}
    />
  {/if}
{/key}
