<script lang="ts">
  import { Button } from "$lib/components";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { ArrowRightFromLine, Repeat, Undo2, X } from "lucide-svelte";
  import { fly } from "svelte/transition";

  /**
   * A repeating event was just edited on one occurrence. Offered from the corner, in the same card
   * the failures use, so the choice doesn't block the grid it's about: the whole series, this one
   * and the ones after it, or just this one — which has already happened, so it is the dismiss.
   * ⌘/Ctrl-dragging skips this on purpose by detaching the occurrence up front.
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
      <div class="rounded-xl border border-line-strong bg-surface p-1.5 shadow-(--shadow-float)">
        <p class="t-micro max-w-72 truncate px-2 pt-1 pb-1.5 text-fg-muted">
          Changed “{prompt.title || "Untitled"}” — a repeating event
        </p>
        <div class="flex items-center gap-0.5">
        <Button
          variant="solid"
          size="sm"
          label="Change all"
          title="Apply this change to every occurrence"
          onclick={() => data.applyToSeries("all")}
        >
          {#snippet icon()}<Repeat size={15} />{/snippet}
        </Button>
        <Button
          variant="bare"
          label="From here on"
          title="Apply this change to this and every later occurrence"
          onclick={() => data.applyToSeries("following")}
        >
          {#snippet icon()}<ArrowRightFromLine size={15} />{/snippet}
        </Button>
        <Button variant="bare" title="Undo this change" onclick={() => data.undoSeriesEdit()}>
          {#snippet icon()}<Undo2 size={15} />{/snippet}
        </Button>
        <Button variant="bare" label="Cancel" title="Keep the change on this one only" onclick={() => data.dismissSeriesPrompt()}>
          {#snippet icon()}<X size={15} />{/snippet}
        </Button>
        </div>
      </div>
    </div>
  {/if}
{/key}
