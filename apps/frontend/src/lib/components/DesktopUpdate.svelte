<script lang="ts">
  import { RefreshCw, RotateCcw } from "lucide-svelte";
  import { desktopUpdates } from "$lib/desktop/updates.svelte";

  /**
   * The Mac app's own updates, said out loud once. The install happens on its own; the only thing
   * that needs a person is the relaunch, and this is the second place to do it — the first is the
   * menu bar, which is what somebody is usually looking at.
   */
  const percent = $derived(
    desktopUpdates.progress === null ? "" : ` ${Math.round(desktopUpdates.progress * 100)}%`,
  );
</script>

<section>
  {#if desktopUpdates.stage === "ready"}
    <p class="t-micro mb-3 text-fg-faint">
      Version {desktopUpdates.installed} is installed and starts with the app.
    </p>
    <button
      type="button"
      class="press flex w-full items-center justify-center gap-2 rounded-md border border-line-strong px-4 py-3 text-fg"
      onclick={() => void desktopUpdates.restart()}
    >
      <RotateCcw size={16} />
      <span class="t-body-strong">Restart Balance</span>
    </button>
  {:else}
    <p class="t-micro mb-3 text-fg-faint">
      Balance checks for a new version every few hours and installs it in the background.
    </p>
    <button
      type="button"
      class="press flex w-full items-center justify-center gap-2 rounded-md border border-line-strong px-4 py-3 text-fg disabled:opacity-50"
      disabled={desktopUpdates.stage !== "idle"}
      onclick={() => void desktopUpdates.check()}
    >
      <RefreshCw size={16} />
      <span class="t-body-strong">
        {#if desktopUpdates.stage === "checking"}
          Checking…
        {:else if desktopUpdates.stage === "downloading"}
          Downloading{percent}
        {:else}
          Check for updates
        {/if}
      </span>
    </button>
  {/if}
</section>
