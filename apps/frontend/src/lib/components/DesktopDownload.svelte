<script lang="ts">
  import { Download } from "lucide-svelte";
  import { DESKTOP_DOWNLOAD_URL, desktopDownload } from "$lib/desktop/download.svelte";

  /**
   * The Mac app, offered where the account already is. Only a browser sees this: the two app
   * shells are already the thing it installs.
   */
  $effect(() => {
    void desktopDownload.ensure();
  });

  const build = $derived(desktopDownload.build);
</script>

{#if build}
  <section>
    <a
      href={DESKTOP_DOWNLOAD_URL}
      download
      class="press flex w-full items-center justify-center gap-2 rounded-md border border-line-strong px-4 py-3 text-fg"
    >
      <Download size={16} />
      <span class="t-body-strong">Download for Mac</span>
    </a>
    <p class="t-data-micro mt-2 text-center text-fg-faint">
      {build.version} · {build.arch} · {desktopDownload.size}
    </p>
    <!-- Until the app is notarized, macOS stops the first launch of a downloaded copy. Saying so
         here, with the way out, beats a dialog claiming the app is damaged. -->
    {#if !build.notarized}
      <p class="t-micro mt-3 text-fg-faint">
        This build isn't signed by Apple yet, so the first launch is blocked: open it once from
        <span class="text-fg">System Settings → Privacy &amp; Security → Open Anyway</span>. Or run
        <code class="select-all">xattr -dr com.apple.quarantine /Applications/Balance.app</code>.
      </p>
    {/if}
  </section>
{/if}
