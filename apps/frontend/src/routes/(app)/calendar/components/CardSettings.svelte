<script lang="ts" module>
  import type { Icon } from "lucide-svelte";

  export interface CardSection {
    readonly id: string;
    readonly label: string;
    readonly icon: typeof Icon;
  }
</script>

<script lang="ts">
  import { Popover, Switch } from "$lib/components";
  import { FEEDS, INTEGRATIONS, integrations } from "$lib/integrations/integrations.svelte";
  import { preferences } from "$lib/preferences.svelte";
  import { Plug, X } from "lucide-svelte";

  /**
   * What this card shows and what feeds it.
   *
   * One popover, two groups. The first is integrations: the feed linked to this block, with a
   * cross to unlink it, or the feeds that could be, each with a plug to connect the device and
   * link in one go. The second is the card's own sections, each with a switch — folding away the
   * rows you never fill is what keeps the card the size of what it says. Both are "what is on
   * this card", which is why they are one place rather than two.
   */
  let {
    sections,
    source,
    onlink,
    onunlink,
  }: {
    sections: readonly CardSection[];
    /** The feed this block is linked to — "apple-health:sleep" — or null. */
    source: string | null;
    onlink: (source: string) => void;
    onunlink: () => void;
  } = $props();

  const linked = $derived(source ? (FEEDS.get(source) ?? null) : null);
  const hidden = $derived(new Set(preferences.hiddenSections));
</script>

<Popover width={260} align="end">
  {#snippet trigger(open)}
    <button type="button" title="Integrations" onclick={open} class="press-sm shrink-0 rounded p-1 text-fg-faint hover:text-fg">
      <Plug size={13} />
    </button>
  {/snippet}
  {#snippet content(close)}
    <div class="space-y-3 p-2">
      <div class="space-y-1">
        {#if linked}
          <div class="flex items-center gap-2 rounded-md border border-line px-2 py-1.5">
            <linked.integration.icon size={15} class="shrink-0 text-fg-muted" />
            <span class="t-label min-w-0 flex-1 truncate">{linked.integration.name} · {linked.feed.label}</span>
            <button
              type="button"
              aria-label="Unlink {linked.feed.label}"
              onclick={() => {
                onunlink();
                close();
              }}
              class="press-sm shrink-0 rounded-full border border-line p-0.5 text-fg-faint hover:text-fg"
            >
              <X size={11} />
            </button>
          </div>
        {:else}
          {#each INTEGRATIONS as integration (integration.id)}
            {#each integration.feeds as feed (feed.id)}
              <button
                type="button"
                title={integration.available ? feed.note : integration.unavailableNote}
                onclick={() => {
                  onlink(`${integration.id}:${feed.id}`);
                  close();
                }}
                class="menu-row"
              >
                <integration.icon size={15} class="shrink-0 text-fg-faint" />
                <span class="min-w-0 flex-1 truncate">{integration.name} · {feed.label}</span>
                <span class="t-micro shrink-0 text-fg-faint">
                  {integration.available && !integrations.connected(integration.id) ? "Connect" : "Link"}
                </span>
                <Plug size={13} class="shrink-0 text-fg-faint" />
              </button>
            {/each}
          {/each}
        {/if}
      </div>

      <div class="space-y-0.5 border-t border-line pt-2">
        {#each sections as section (section.id)}
          {@const shown = !hidden.has(section.id)}
          <div class="flex items-center gap-2 px-2 py-1">
            <section.icon size={15} class="shrink-0 text-fg-faint" />
            <span class="t-label flex-1 text-fg">Show {section.label.toLowerCase()}</span>
            <Switch
              checked={shown}
              label="Show {section.label.toLowerCase()}"
              onchange={(next) => preferences.toggleSection(section.id, next)}
            />
          </div>
        {/each}
      </div>
    </div>
  {/snippet}
</Popover>
