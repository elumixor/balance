<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import SeriesPrompt from "./SeriesPrompt.svelte";

  /**
   * A repeating event was just edited on one occurrence. Offered from the corner so the choice
   * doesn't block the grid it's about: just this one — which has already happened, so it is the
   * default — this one and the ones after it, or the whole series. Dismissing is the one way
   * back: it takes the edit off this occurrence too. ⌘/Ctrl-dragging skips this on purpose by
   * detaching the occurrence up front.
   *
   * Keyed on the offer's id: a second edit takes the first card away and brings its own, rather
   * than silently relabelling one that has been sitting there since the edit before.
   */
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
      verb="Change"
      title={prompt.title}
      hints={[
        "Keep the change on this occurrence only",
        "Apply this change to this and every later occurrence",
        "Apply this change to every occurrence",
      ]}
      cancelHint="Undo this change"
      onchoose={choose}
      oncancel={() => void data.undoSeriesEdit()}
    />
  {/if}
{/key}
