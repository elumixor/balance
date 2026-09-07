<script lang="ts">
  import { Button, Tooltip } from "$lib/components";
  import { buildInfo } from "$lib/core/build-info";
  import { DESKTOP_DOWNLOAD_URL, desktopDownload } from "$lib/desktop/download.svelte";
  import { openExternal } from "$lib/desktop/open";
  import { isDesktop, isNativeShell } from "$lib/desktop/platform";
  import { desktopUpdates } from "$lib/desktop/updates.svelte";
  import { APP_STORE_URL } from "$lib/mobile/platform";
  import { Download, ExternalLink, Info, RefreshCw, RotateCcw } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";

  /**
   * Which build this is, and how the next one arrives — one `SettingRow` at the foot of settings.
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

  const build = $derived(desktopDownload.build);
</script>

<div class="space-y-1">
  <SettingRow icon={Info} label="Balance" note={facts} flat>
    {#if isDesktop}
      <Button
        label={ready ? "Restart" : "Check now"}
        title={ready ? "Quit and come back on the new version" : "Ask for a newer version now"}
        variant="outline"
        size="sm"
        disabled={busy}
        onclick={() => void (ready ? desktopUpdates.restart() : desktopUpdates.check())}
      >
        {#snippet icon()}
          {#if ready}<RotateCcw size={14} />{:else}<RefreshCw size={14} class={busy ? "animate-spin" : ""} />{/if}
        {/snippet}
      </Button>
    {/if}
    {#if !isNativeShell}
      <!-- A link, not a button: `download` is what keeps the DMG out of a new tab. -->
      <Button
        label="Mac"
        href={DESKTOP_DOWNLOAD_URL}
        download
        title={build ? `Balance for Mac · ${build.version} · ${build.arch} · ${desktopDownload.size}` : "Balance for Mac"}
        variant="outline"
        size="sm"
      >
        {#snippet icon()}<Download size={14} />{/snippet}
      </Button>
    {/if}
    <Button
      label="App Store"
      title="Balance for iPhone and Apple Watch"
      variant="outline"
      size="sm"
      onclick={() => void openExternal(APP_STORE_URL)}
    >
      {#snippet icon()}<ExternalLink size={14} />{/snippet}
    </Button>
  </SettingRow>

  <!-- Until the app is notarized, macOS stops the first launch of a downloaded copy. Saying so
       here, with the way out, beats a dialog claiming the app is damaged. -->
  {#if !isNativeShell && build && !build.notarized}
    <p class="t-micro px-1.5 text-fg-faint">
      The Mac app is not signed by Apple yet, so its first launch is blocked: open it once from
      <span class="text-fg">System Settings → Privacy &amp; Security → Open Anyway</span>, or run
      <code class="select-all">xattr -dr com.apple.quarantine /Applications/Balance.app</code>.
    </p>
  {/if}
</div>

{#snippet facts()}
  <Tooltip label={buildInfo.provenance}>
    <span class="cursor-help select-text">Version {buildInfo.version}</span>
  </Tooltip>
  <span class="text-line-strong"> · </span>{buildInfo.platform} build{#if isDesktop}<span class="text-line-strong"> · </span>{checked}{/if}
{/snippet}
