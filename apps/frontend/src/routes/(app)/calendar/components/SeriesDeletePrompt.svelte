<script lang="ts">
  import { Button } from "$lib/components";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { ArrowRightFromLine, Repeat, Trash2, X } from "lucide-svelte";
  import { fly } from "svelte/transition";

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
    <div class="fixed right-3 bottom-3 z-50" transition:fly={{ y: 16, duration: 180 }}>
      <div
        class="flex items-center gap-0.5 rounded-xl border border-line-strong bg-surface p-1.5
          shadow-(--shadow-float)"
      >
        <span class="t-micro max-w-40 truncate px-2 text-fg-muted">Delete “{prompt.event.title || "Untitled"}”</span>
        <Button
          variant="bare"
          label="This one"
          title="Delete only this occurrence"
          onclick={() => data.deleteEvent(prompt.event, "instance")}
        >
          {#snippet icon()}<Trash2 size={15} />{/snippet}
        </Button>
        <Button
          variant="bare"
          label="From here on"
          title="Delete this and every later occurrence"
          onclick={() => data.deleteEvent(prompt.event, "following")}
        >
          {#snippet icon()}<ArrowRightFromLine size={15} />{/snippet}
        </Button>
        <Button
          variant="bare"
          label="All"
          title="Delete the whole series"
          onclick={() => data.deleteEvent(prompt.event, "all")}
        >
          {#snippet icon()}<Repeat size={15} />{/snippet}
        </Button>
        <Button variant="bare" title="Keep it" onclick={() => data.dismissDeletePrompt()}>
          {#snippet icon()}<X size={15} />{/snippet}
        </Button>
      </div>
    </div>
  {/if}
{/key}
