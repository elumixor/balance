<script lang="ts">
  import IconButton from "$lib/components/IconButton.svelte";
  import { openExternal } from "$lib/desktop/open";
  import type { ProjectLink } from "$lib/types";
  import { Link2, Plus, X } from "lucide-svelte";

  /** Where the project lives elsewhere: a repo, a store page, the Notion page it was imported from. */
  let { links, onchange }: { links: ProjectLink[]; onchange: (links: ProjectLink[]) => void } = $props();

  let draft = $state("");

  /** A pasted URL is enough: the label is its host until somebody types a better one. */
  function add() {
    const url = draft.trim();
    if (!url) return;
    const withScheme = /^https?:\/\//.test(url) ? url : `https://${url}`;
    let label = withScheme;
    try {
      label = new URL(withScheme).hostname.replace(/^www\./, "");
    } catch {
      // Not a URL the browser can parse: keep what was typed as the label and let it be opened as is.
    }
    onchange([...links, { label, url: withScheme }]);
    draft = "";
  }

  function relabel(index: number, label: string) {
    onchange(links.map((link, i) => (i === index ? { ...link, label } : link)));
  }
</script>

<div class="space-y-1">
  {#each links as link, i (link.url + i)}
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={() => openExternal(link.url)}
        class="press-sm flex min-w-0 items-center gap-1.5 text-fg-muted hover:text-fg"
        title={link.url}
      >
        <Link2 size={13} class="shrink-0" />
      </button>
      <input
        value={link.label}
        oninput={(e) => relabel(i, e.currentTarget.value)}
        aria-label="Link label"
        class="t-label h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-fg hover:border-line focus:border-line-strong focus:outline-none"
      />
      <IconButton label="Remove link" tone="plain" onclick={() => onchange(links.filter((_, j) => j !== i))}>
        <X size={13} class="text-fg-faint" />
      </IconButton>
    </div>
  {/each}
  <div class="flex items-center gap-2">
    <Plus size={13} class="shrink-0 text-fg-faint" />
    <input
      bind:value={draft}
      placeholder="Paste a link"
      aria-label="New link"
      onkeydown={(e) => e.key === "Enter" && add()}
      onblur={add}
      class="t-label h-7 min-w-0 flex-1 bg-transparent px-1 placeholder:text-fg-faint focus:outline-none"
    />
  </div>
</div>
