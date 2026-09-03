<script lang="ts">
  import { diagnostics } from "$lib/diagnostics.svelte";
  import { X } from "lucide-svelte";
  import { fly } from "svelte/transition";
  import CopyButton from "./CopyButton.svelte";

  /**
   * What the app says when something failed with nobody watching.
   *
   * A corner, not a curtain. The screen underneath is usually still worth using, so a failure gets
   * one line — what failed, and the first sentence of why, cut where it stops fitting — and the
   * stack behind a copy button, which is the only thing a webview with no console can be asked for.
   * It used to print the whole of it, and a query a page long covered the week it was about.
   */

  /** Three at once is already a broken app; the rest are in the copied report, not on the screen. */
  const SHOWN = 3;

  const shown = $derived([...diagnostics.problems].reverse().slice(0, SHOWN));
  const hidden = $derived(Math.max(0, diagnostics.problems.length - SHOWN));
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
        class="pointer-events-auto flex items-center gap-1 rounded-xl border border-danger/40 bg-surface py-2 pr-1
          pl-3 shadow-(--shadow-float)"
        transition:fly={{ y: -12, duration: 180 }}
      >
        <div class="min-w-0 flex-1">
          <p class="t-micro truncate text-danger">
            {problem.scope} failed{problem.count > 1 ? ` (${problem.count}×)` : ""}
          </p>
          <p class="t-label truncate text-fg" title={problem.message}>{problem.message}</p>
        </div>
        <CopyButton text={() => diagnostics.textOf(problem)} label="Copy error details" />
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
