<script lang="ts">
  import { Button } from "$lib/components";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, scale } from "svelte/transition";

  /**
   * A repeating event is about to be deleted, and nothing has gone yet. The edit prompt can sit
   * in a corner because one occurrence can be put back; a series can't, so this one is an alert:
   * over everything, the week behind it dimmed and blurred, and no way past it but an answer —
   * this one, this and the ones after it, the whole series, or keep it.
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
        aria-labelledby="series-delete-title"
        tabindex="-1"
        transition:scale={{ duration: 180, start: 0.96, easing: cubicOut }}
        onclick={(e) => e.stopPropagation()}
        onkeydown={() => {}}
        class="w-full max-w-xs rounded-2xl border border-line-strong bg-surface p-5 shadow-(--shadow-float)
          outline-none"
      >
        <h2 id="series-delete-title" class="t-heading">Delete repeating event?</h2>
        <p class="t-body mt-1 text-fg-muted">
          “{prompt.event.title || "Untitled"}” repeats. Delete just this one, this and every later one, or
          the whole series?
        </p>
        <div class="mt-4 flex flex-col gap-2">
          <Button variant="danger" full label="Only this one" onclick={() => data.deleteEvent(prompt.event, "instance")} />
          <Button variant="outline" full label="This and following" onclick={() => data.deleteEvent(prompt.event, "following")} />
          <Button variant="outline" full label="All events" onclick={() => data.deleteEvent(prompt.event, "all")} />
          <Button variant="bare" full label="Keep it" onclick={() => data.dismissDeletePrompt()} />
        </div>
      </div>
    </div>
  {/if}
{/key}
