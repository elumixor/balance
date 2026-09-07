<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import SeriesPrompt from "./SeriesPrompt.svelte";

  /**
   * A repeating event is about to be deleted, and nothing has gone yet. The edit prompt can ask
   * afterwards because one occurrence can be put back; a series can't, so this one asks first,
   * from the same corner: this one, this and the ones after it, or the whole series.
   */
  const data = calendarData;
  const prompt = $derived(data.deletePrompt);
</script>

{#key prompt?.id}
  {#if prompt}
    <SeriesPrompt
      verb="Delete"
      title={prompt.event.title}
      hints={["Delete only this occurrence", "Delete this and every later occurrence", "Delete the whole series"]}
      cancelHint="Keep it"
      onchoose={(scope) => void data.deleteEvent(prompt.event, scope)}
      oncancel={() => data.dismissDeletePrompt()}
    />
  {/if}
{/key}
