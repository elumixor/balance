<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import type { Category } from "$lib/core/records";
  import { Trash2 } from "lucide-svelte";
  import SeriesPrompt from "./SeriesPrompt.svelte";

  /**
   * A repeating event is about to be deleted, and nothing has gone yet. The edit prompt can ask
   * afterwards because one occurrence can be put back; a series can't, so this one asks first,
   * beside the block: this one, this and the ones after it, or the whole series.
   */
  let { categories }: { categories: Map<string, Category> } = $props();

  const data = calendarData;
  const prompt = $derived(data.deletePrompt);
</script>

{#key prompt?.id}
  {#if prompt}
    <SeriesPrompt
      heading="Delete “{prompt.event.title || 'Untitled'}” — a repeating event"
      event={prompt.event}
      {categories}
      icon={Trash2}
      hints={["Delete only this occurrence", "Delete this and every later occurrence", "Delete the whole series", "Keep it"]}
      onchoose={(scope) => void data.deleteEvent(prompt.event, scope)}
      oncancel={() => data.dismissDeletePrompt()}
    />
  {/if}
{/key}
