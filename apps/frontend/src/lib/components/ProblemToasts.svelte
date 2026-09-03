<script lang="ts">
  import { diagnostics, type Problem } from "$lib/diagnostics.svelte";
  import { RefreshCw, X } from "lucide-svelte";
  import { fly } from "svelte/transition";
  import CopyButton from "./CopyButton.svelte";

  /**
   * The app's one way of saying something went wrong. Nothing else in this app draws a failure.
   *
   * A corner, not a curtain: whatever failed, the screen underneath is usually still worth using.
   * One line each, and that line is written for the person — never the server's own words, which
   * is how a card meant to hold a sentence ended up holding a database query a page long. What
   * actually failed is behind the copy, which is the only shape anybody wants it in.
   */

  /** Three at once is already a broken app; the rest are in the copied report, not on the screen. */
  const SHOWN = 3;

  const shown = $derived([...diagnostics.problems].reverse().slice(0, SHOWN));
  const hidden = $derived(Math.max(0, diagnostics.problems.length - SHOWN));

  /**
   * The card goes as soon as the refresh is asked for, rather than waiting to see: whatever it does
   * next reports itself, so a second failure is a new card and a success is silence.
   */
  function retry(problem: Problem) {
    const again = problem.retry;
    diagnostics.dismiss(problem.id);
    void again?.();
  }
</script>

{#if shown.length > 0}
  <!-- Above the top strip and clear of the nudge below it, on the side no screen puts anything. -->
  <div
    class="safe-top pointer-events-none fixed top-0 right-0 z-50 flex w-full max-w-sm flex-col items-stretch gap-2
      p-3 md:p-4"
  >
    {#each shown as problem (problem.id)}
      <div
        role="alert"
        class="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-danger/40 bg-surface py-1.5
          pr-1.5 pl-3 shadow-(--shadow-float)"
        transition:fly={{ y: -12, duration: 180 }}
      >
        <p class="t-label min-w-0 flex-1 truncate text-danger" title={problem.message}>
          {problem.title}{problem.count > 1 ? ` (${problem.count}×)` : ""}
        </p>
        <CopyButton text={() => diagnostics.textOf(problem)} label="Copy error details" />
        {#if problem.retry}
          <button
            type="button"
            class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
            aria-label="Try again"
            title="Try again"
            onclick={() => retry(problem)}
          >
            <RefreshCw size={15} />
          </button>
        {/if}
        <button
          type="button"
          class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
          aria-label="Dismiss"
          onclick={() => diagnostics.dismiss(problem.id)}
        >
          <X size={15} />
        </button>
      </div>
    {/each}

    {#if hidden > 0}
      <div class="pointer-events-auto flex items-center justify-end gap-3 pr-1">
        <span class="t-micro text-fg-faint">{hidden} more</span>
        <button type="button" class="t-micro press-sm text-fg-muted underline" onclick={() => diagnostics.clear()}>
          Dismiss all
        </button>
      </div>
    {/if}
  </div>
{/if}
