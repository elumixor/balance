<script lang="ts">
  import { ExternalLink } from "lucide-svelte";
  import { pageHref } from "$lib/calendar/urn";

  /** Where a sphere's work lives, as a link that opens it; a link this app can't open is shown as text. */
  let { urn }: { urn: string } = $props();

  const href = $derived(pageHref(urn));
</script>

{#if href}
  <a {href} target="_blank" rel="noreferrer" class="t-micro inline-flex items-center gap-1 text-fg-faint hover:text-fg">
    <ExternalLink size={11} />
    Keep
  </a>
{:else}
  <span class="t-micro text-fg-faint">{urn}</span>
{/if}
