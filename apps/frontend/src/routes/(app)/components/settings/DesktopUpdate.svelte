<script lang="ts">
  import { RefreshCw, RotateCcw } from "lucide-svelte";
  import { desktopUpdates } from "$lib/desktop/updates.svelte";

  /**
   * The Mac app's own updates, in one row. The install happens on its own; the only thing that
   * needs a person is the relaunch, and this is the second place to do it — the first is the
   * menu bar, which is what somebody is usually looking at.
   */
  const ready = $derived(desktopUpdates.stage === "ready");

  const note = $derived.by(() => {
    switch (desktopUpdates.stage) {
      case "ready":
        return `${desktopUpdates.installed} is installed and starts with the app.`;
      case "checking":
        return "Checking…";
      case "downloading":
        return desktopUpdates.progress === null ? "Downloading…" : `Downloading ${Math.round(desktopUpdates.progress * 100)}%`;
      default:
        return "Checked every few hours, installed in the background.";
    }
  });
</script>

<div class="flex items-center justify-between gap-3">
  <div class="min-w-0">
    <p class="t-label text-fg">Updates</p>
    <p class="t-micro text-fg-faint">{note}</p>
  </div>
  <button
    type="button"
    class="press t-label flex shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-fg disabled:opacity-50"
    disabled={!ready && desktopUpdates.stage !== "idle"}
    onclick={() => void (ready ? desktopUpdates.restart() : desktopUpdates.check())}
  >
    {#if ready}<RotateCcw size={14} />Restart{:else}<RefreshCw size={14} />Check{/if}
  </button>
</div>
