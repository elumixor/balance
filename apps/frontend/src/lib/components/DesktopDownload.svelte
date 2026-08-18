<script lang="ts">
  import { Download } from "lucide-svelte";
  import { DESKTOP_DOWNLOAD_URL, desktopDownload } from "$lib/desktop/download.svelte";
  import SectionHeader from "./SectionHeader.svelte";

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
    <SectionHeader title="Balance for Mac" />
    <p class="t-micro mb-3 text-fg-faint">
      The menu bar knows what you're in the middle of, and reminds you before the next thing. Opening it the first
      time needs a right-click → Open, because the build isn't signed by Apple yet.
    </p>
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
  </section>
{/if}
