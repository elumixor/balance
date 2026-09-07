<script lang="ts">
  import { Tooltip } from "$lib/components";
  import { buildInfo } from "$lib/core/build-info";
  import { isDesktop, isNativeShell } from "$lib/desktop/platform";
  import { openExternal } from "$lib/desktop/open";
  import { desktopUpdates } from "$lib/desktop/updates.svelte";
  import { APP_STORE_URL, isIOSApp } from "$lib/mobile/platform";
  import { ExternalLink, RefreshCw, RotateCcw } from "lucide-svelte";
  import DesktopDownload from "./DesktopDownload.svelte";

  /**
   * Which build this is, and how the next one arrives.
   *
   * The same bundle ships three ways and each has its own road to a newer one: the Mac app
   * updates itself and can be asked to look now, the iPhone app is the App Store's, and a browser
   * tab is always current but can be handed the other two. So the rows are the same everywhere
   * and the buttons are not — a "check for updates" on the web would check nothing, and a Mac app
   * has no use for its own DMG.
   */
  const ready = $derived(desktopUpdates.stage === "ready");
  const busy = $derived(desktopUpdates.stage === "checking" || desktopUpdates.stage === "downloading");

  const checked = $derived.by(() => {
    const at = desktopUpdates.checkedAt;
    if (at === null) return "Not checked yet";
    const date = new Date(at);
    const sameDay = date.toDateString() === new Date().toDateString();
    const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return sameDay ? `Checked today at ${time}` : `Checked ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} at ${time}`;
  });

  const updateNote = $derived.by(() => {
    switch (desktopUpdates.stage) {
      case "ready":
        return `${desktopUpdates.installed} is installed and starts with the app.`;
      case "checking":
        return "Checking…";
      case "downloading":
        return desktopUpdates.progress === null ? "Downloading…" : `Downloading ${Math.round(desktopUpdates.progress * 100)}%`;
      default:
        return `${checked} · checked every six hours.`;
    }
  });
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between gap-3">
    <span class="t-label text-fg">Version</span>
    <Tooltip label={buildInfo.provenance}>
      <span class="t-data-micro cursor-help select-text text-fg-muted">{buildInfo.version}</span>
    </Tooltip>
  </div>

  <div class="flex items-center justify-between gap-3">
    <span class="t-label text-fg">Platform</span>
    <span class="t-data-micro text-fg-muted">{buildInfo.platform}</span>
  </div>

  {#if isDesktop}
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="t-label text-fg">Updates</p>
        <p class="t-micro text-fg-faint">{updateNote}</p>
      </div>
      <button
        type="button"
        class="press t-label flex shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-fg disabled:opacity-50"
        disabled={busy}
        onclick={() => void (ready ? desktopUpdates.restart() : desktopUpdates.check())}
      >
        {#if ready}<RotateCcw size={14} />Restart{:else}<RefreshCw size={14} class={busy ? "animate-spin" : ""} />Check now{/if}
      </button>
    </div>
  {/if}

  {#if !isNativeShell}
    <DesktopDownload />
  {/if}

  <div class="flex items-center justify-between gap-3">
    <div class="min-w-0">
      <p class="t-label text-fg">{isIOSApp ? "Updates" : "Balance for iPhone"}</p>
      <p class="t-micro text-fg-faint">{isIOSApp ? "Delivered through the App Store." : "The same account, on your phone and wrist."}</p>
    </div>
    <button
      type="button"
      class="press t-label flex shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-fg"
      onclick={() => void openExternal(APP_STORE_URL)}
    >
      <ExternalLink size={14} />
      App Store
    </button>
  </div>
</div>
