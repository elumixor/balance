<script lang="ts">
  import { diagnostics } from "$lib/diagnostics.svelte";
  import { ChevronDown, ChevronUp, X } from "lucide-svelte";

  /**
   * What the app says when something failed with nobody watching.
   *
   * Deliberately a strip along the top rather than a dialog: whatever went wrong, the screen
   * underneath is usually still worth using, and a modal over a half-loaded week is a second
   * problem. Tapping it opens the technical half — the one thing a webview with no console
   * attached can't otherwise be asked.
   */
  let expanded = $state(false);
  let copied = $state(false);

  const problems = $derived(diagnostics.problems);
  const latest = $derived(diagnostics.latest);

  async function copy() {
    try {
      await navigator.clipboard.writeText(diagnostics.asText);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // A webview without clipboard permission — the text is on screen to be read out anyway.
    }
  }
</script>

{#if diagnostics.showing && latest}
  <div class="safe-top pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-2">
    <div
      class="pointer-events-auto mx-auto max-w-lg overflow-hidden rounded-lg border border-danger/40 bg-surface shadow-(--shadow-float)"
    >
      <div class="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          class="min-w-0 flex-1 text-left"
          onclick={() => (expanded = !expanded)}
          aria-expanded={expanded}
        >
          <p class="t-micro text-danger">
            {latest.scope} failed{latest.count > 1 ? ` (${latest.count}×)` : ""}
          </p>
          <p class="t-label text-fg">{latest.message}</p>
        </button>
        <button type="button" class="press-sm p-1 text-fg-faint" onclick={() => (expanded = !expanded)} aria-label={expanded ? "Hide details" : "Show details"}>
          {#if expanded}<ChevronUp size={16} />{:else}<ChevronDown size={16} />{/if}
        </button>
        <button type="button" class="press-sm p-1 text-fg-faint" onclick={() => diagnostics.dismiss()} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>

      {#if expanded}
        <div class="max-h-[50vh] overflow-y-auto border-t border-line px-3 py-2">
          <p class="t-data-micro whitespace-pre-wrap break-words text-fg-faint">{diagnostics.context}</p>
          {#each [...problems].reverse() as problem (problem.id)}
            <div class="mt-2 border-t border-line pt-2 first:border-0 first:pt-0">
              <p class="t-micro text-fg-muted">
                {problem.at.toLocaleTimeString()} · {problem.scope}{problem.count > 1 ? ` ×${problem.count}` : ""}
              </p>
              <p class="t-label break-words text-fg">{problem.message}</p>
              {#if problem.detail}
                <pre class="t-data-micro mt-1 whitespace-pre-wrap break-words text-fg-faint">{problem.detail}</pre>
              {/if}
            </div>
          {/each}
          <div class="mt-2 flex gap-3">
            <button type="button" class="t-micro press-sm text-fg-muted underline" onclick={() => void copy()}>
              {copied ? "Copied" : "Copy report"}
            </button>
            <button type="button" class="t-micro press-sm text-fg-muted underline" onclick={() => diagnostics.clear()}>
              Clear
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
