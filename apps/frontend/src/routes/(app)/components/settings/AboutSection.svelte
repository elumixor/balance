<script lang="ts">
  import { Tooltip } from "$lib/components";
  import { buildInfo } from "$lib/core/build-info";
  import { DESKTOP_DOWNLOAD_URL, desktopDownload } from "$lib/desktop/download.svelte";
  import { openExternal } from "$lib/desktop/open";
  import { isDesktop, isNativeShell } from "$lib/desktop/platform";
  import { desktopUpdates } from "$lib/desktop/updates.svelte";
  import { APP_STORE_URL } from "$lib/mobile/platform";
  import { Download, ExternalLink, RefreshCw, RotateCcw } from "lucide-svelte";

  /**
   * Which build this is, and how the next one arrives — one line.
   *
   * The facts read left to right: the version (its commit and build time behind a hover), the
   * platform, and on the Mac when the app last asked for a newer one. The buttons are the roads
   * to the next build, and each platform only gets the roads it can take: the Mac app updates
   * itself and can be asked to look now, a browser tab can be handed the DMG, and every platform
   * is one tap from the iPhone app's App Store page — where the iPhone itself is updated.
   */
  const ready = $derived(desktopUpdates.stage === "ready");
  const busy = $derived(desktopUpdates.stage === "checking" || desktopUpdates.stage === "downloading");

  $effect(() => {
    void desktopDownload.ensure();
  });

  const checked = $derived.by(() => {
    switch (desktopUpdates.stage) {
      case "ready":
        return `${desktopUpdates.installed} ready`;
      case "checking":
        return "Checking…";
      case "downloading":
        return desktopUpdates.progress === null ? "Downloading…" : `Downloading ${Math.round(desktopUpdates.progress * 100)}%`;
    }
    const at = desktopUpdates.checkedAt;
    if (at === null) return "Not checked yet";
    const date = new Date(at);
    const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const day = date.toDateString() === new Date().toDateString() ? "today" : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return `Checked ${day} at ${time}`;
  });

  const facts = $derived([buildInfo.platform, ...(isDesktop ? [checked] : [])]);
  const build = $derived(desktopDownload.build);
</script>

<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
  <p class="t-data-micro flex min-w-0 flex-wrap items-center gap-x-2 text-fg-muted">
    <Tooltip label={buildInfo.provenance}>
      <span class="cursor-help select-text">{buildInfo.version}</span>
    </Tooltip>
    {#each facts as fact (fact)}
      <span class="text-line-strong">·</span>
      <span class="text-fg-faint">{fact}</span>
    {/each}
  </p>

  <div class="flex shrink-0 items-center gap-2">
    {#if isDesktop}
      <button
        type="button"
        class="press t-label flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-fg disabled:opacity-50"
        disabled={busy}
        title={ready ? "Quit and come back on the new version" : "Ask for a newer version now"}
        onclick={() => void (ready ? desktopUpdates.restart() : desktopUpdates.check())}
      >
        {#if ready}<RotateCcw size={14} />Restart{:else}<RefreshCw size={14} class={busy ? "animate-spin" : ""} />Check now{/if}
      </button>
    {/if}
    {#if !isNativeShell && build}
      <a
        href={DESKTOP_DOWNLOAD_URL}
        download
        title="Balance for Mac · {build.version} · {build.arch} · {desktopDownload.size}"
        class="press t-label flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-fg"
      >
        <Download size={14} />
        Mac
      </a>
    {/if}
    <button
      type="button"
      class="press t-label flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-fg"
      title="Balance for iPhone and Apple Watch"
      onclick={() => void openExternal(APP_STORE_URL)}
    >
      <ExternalLink size={14} />
      App Store
    </button>
  </div>

  <!-- Until the app is notarized, macOS stops the first launch of a downloaded copy. Saying so
       here, with the way out, beats a dialog claiming the app is damaged. -->
  {#if !isNativeShell && build && !build.notarized}
    <p class="t-micro basis-full text-fg-faint">
      The Mac app is not signed by Apple yet, so its first launch is blocked: open it once from
      <span class="text-fg">System Settings → Privacy &amp; Security → Open Anyway</span>, or run
      <code class="select-all">xattr -dr com.apple.quarantine /Applications/Balance.app</code>.
    </p>
  {/if}
</div>
