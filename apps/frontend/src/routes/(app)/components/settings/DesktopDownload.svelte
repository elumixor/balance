<script lang="ts">
  import { Download } from "lucide-svelte";
  import { DESKTOP_DOWNLOAD_URL, desktopDownload } from "$lib/desktop/download.svelte";

  /**
   * The Mac app, offered where the account already is. Only a browser sees this, and only once
   * there is a build to offer: the two app shells are already the thing it installs.
   */
  $effect(() => {
    void desktopDownload.ensure();
  });

  const build = $derived(desktopDownload.build);
</script>

{#if build}
  <div>
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="t-label text-fg">Balance for Mac</p>
        <p class="t-data-micro text-fg-faint">{build.version} · {build.arch} · {desktopDownload.size}</p>
      </div>
      <a
        href={DESKTOP_DOWNLOAD_URL}
        download
        class="press t-label flex shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-fg"
      >
        <Download size={14} />
        Download
      </a>
    </div>
    <!-- Until the app is notarized, macOS stops the first launch of a downloaded copy. Saying so
         here, with the way out, beats a dialog claiming the app is damaged. -->
    {#if !build.notarized}
      <p class="t-micro mt-2 text-fg-faint">
        Not signed by Apple yet, so the first launch is blocked: open it once from
        <span class="text-fg">System Settings → Privacy &amp; Security → Open Anyway</span>, or run
        <code class="select-all">xattr -dr com.apple.quarantine /Applications/Balance.app</code>.
      </p>
    {/if}
  </div>
{/if}
