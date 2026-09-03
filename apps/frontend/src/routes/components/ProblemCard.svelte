<script lang="ts">
  import { diagnostics, type Problem } from "$lib/diagnostics.svelte";
  import { RefreshCw, X } from "lucide-svelte";
  import { CopyButton } from "$lib/components";

  /**
   * One failure, as the corner says it: a sentence written for the person, and nothing else.
   *
   * What actually broke — the query, the status, the stack — is behind the copy, because a card
   * that grows to hold a database query covers the week it is trying to explain.
   */
  let { problem }: { problem: Problem } = $props();

  /**
   * The card goes as soon as the refresh is asked for, rather than waiting to see: whatever it
   * does next reports itself, so a second failure is a new card and a success is silence.
   */
  function retry() {
    const again = problem.retry;
    diagnostics.dismiss(problem.id);
    void again?.();
  }
</script>

<div
  class="flex w-full items-center gap-0.5 rounded-xl border border-danger/40 bg-surface py-1.5 pr-1.5 pl-3
    shadow-(--shadow-float)"
>
  <p class="t-label min-w-0 flex-1 truncate text-danger" title={problem.message}>{problem.title}</p>
  <CopyButton text={() => diagnostics.textOf(problem)} label="Copy error details" />
  {#if problem.retry}
    <button
      type="button"
      class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
      aria-label="Try again"
      title="Try again"
      onclick={retry}
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
