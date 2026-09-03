<script lang="ts">
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { connectGoogle } from "$lib/calendar/connect";
  import { store } from "$lib/store.svelte";
  import { Plus } from "lucide-svelte";
  import { type Pane, PANES } from "./panes";
  import { diagnostics } from "$lib/diagnostics.svelte";

  /**
   * The rail down the left of the settings panel: which page you're on, and which accounts the
   * calendar is read from.
   *
   * The accounts are here rather than only inside the Calendars page because they are the thing
   * people come to this panel to check — "is my work address still connected" — and a rail is
   * where you look for an answer you don't have to open anything to get.
   */
  let { pane = $bindable<Pane>("general") }: { pane: Pane } = $props();

  const accounts = $derived(store.calendars.value?.accounts ?? []);

  // The rail names the connected accounts, so it needs them whether or not the Calendars page
  // has ever been opened.
  $effect(() => {
    if (calendarData.connected) void store.calendars.ensure();
  });

  let connecting = $state(false);

  async function addAccount() {
    connecting = true;
    try {
      await connectGoogle();
      await store.calendars.refresh();
    } catch (e) {
      diagnostics.report("Google Calendar", e, { title: "Couldn’t connect Google Calendar" });
    } finally {
      connecting = false;
    }
  }
</script>

{#snippet railLabel(text: string)}
  <p class="t-micro px-2 pt-4 pb-1.5 text-fg-faint uppercase">{text}</p>
{/snippet}

<nav class="flex flex-col gap-0.5 px-2 pb-4" aria-label="Settings">
  {@render railLabel("Account")}
  {#each PANES as page (page.value)}
    {@const active = pane === page.value}
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onclick={() => (pane = page.value)}
      class="press-sm flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left
        {active ? 'bg-surface text-fg' : 'text-fg-muted hover:bg-surface/60'}"
    >
      <page.icon size={16} class="shrink-0 {active ? 'text-fg' : 'text-fg-faint'}" />
      <span class="t-label truncate">{page.label}</span>
    </button>
  {/each}

  {#if accounts.length > 0}
    {@render railLabel("Calendar accounts")}
    {#each accounts as account (account.accountId)}
      <button
        type="button"
        onclick={() => (pane = "calendars")}
        class="press-sm flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-fg-muted
          hover:bg-surface/60"
      >
        <span
          class="t-micro flex size-4 shrink-0 items-center justify-center rounded-full border
            {account.needsReconnect ? 'border-caution text-caution' : 'border-line-strong text-fg-faint'}"
        >
          G
        </span>
        <span class="t-label truncate">{account.email ?? "Unknown account"}</span>
      </button>
    {/each}
    <button
      type="button"
      onclick={() => void addAccount()}
      disabled={connecting}
      class="press-sm flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-fg-muted
        hover:bg-surface/60 disabled:opacity-50"
    >
      <Plus size={16} class="shrink-0 text-fg-faint" />
      <span class="t-label truncate">{connecting ? "Connecting…" : "Add calendar account"}</span>
    </button>
  {/if}
</nav>
