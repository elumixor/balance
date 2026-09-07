<script lang="ts">
  import { Button } from "$lib/components";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { ArrowRightFromLine, Repeat, Trash2 } from "lucide-svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, scale } from "svelte/transition";

  /**
   * A repeating event is about to be deleted, and nothing has gone yet. The edit prompt can sit
   * in a corner because one occurrence can be put back; a series can't, so this one is an alert:
   * over everything, the week behind it dimmed and blurred, and no way past it but an answer —
   * this one, this and the ones after it, the whole series, or keep it. The card itself is the
   * same strip the edit prompt uses, so the two questions read as one control.
   */
  const data = calendarData;
  const prompt = $derived(data.deletePrompt);

  let panel = $state<HTMLElement>();
  // Opening moves focus in, so Escape and Tab reach the alert rather than the grid behind it.
  $effect(() => {
    if (prompt) panel?.focus();
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (prompt && e.key === "Escape") {
      e.stopPropagation();
      data.dismissDeletePrompt();
    }
  }}
/>

{#key prompt?.id}
  {#if prompt}
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center bg-overlay-strong p-4 backdrop-blur-sm
        backdrop-saturate-50"
      transition:fade={{ duration: 140 }}
      onclick={() => data.dismissDeletePrompt()}
      onkeydown={() => {}}
      role="presentation"
    >
      <div
        bind:this={panel}
        role="alertdialog"
        aria-modal="true"
        aria-label="Delete repeating event"
        tabindex="-1"
        transition:scale={{ duration: 180, start: 0.96, easing: cubicOut }}
        onclick={(e) => e.stopPropagation()}
        onkeydown={() => {}}
        class="flex flex-col items-center rounded-xl border border-line-strong bg-surface p-1.5
          shadow-(--shadow-float) outline-none"
      >
        <p class="t-micro max-w-72 truncate px-2 pt-1 pb-1.5 text-center text-fg-muted">
          Delete “{prompt.event.title || "Untitled"}” — it repeats
        </p>
        <div class="flex items-center justify-center gap-0.5">
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
        </div>
        <Button variant="bare" label="Cancel" title="Keep it" onclick={() => data.dismissDeletePrompt()} />
      </div>
    </div>
  {/if}
{/key}
