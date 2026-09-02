<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { Sunrise, X } from "lucide-svelte";
  import { fly } from "svelte/transition";

  /**
   * The sitting, asking. It used to be a tab, which is a permanent invitation to something that is
   * only worth doing twice a day; this appears when it is owed and leaves when it isn't.
   *
   * Two shapes, one state. On a wide screen it is a mark on the rail, in the corner where an app
   * puts its notifications — small, because the week is still what the screen is for. On a phone
   * there is no rail, and a badge that small on a grid full of coloured blocks is invisible, so it
   * becomes a card sitting on the bar under the thumb: what it pays, and a way to say not now.
   */
  let { variant }: { variant: "rail" | "floating" } = $props();

  const showing = $derived(sessionNudge.pending && !page.url.pathname.startsWith("/session"));
  const stars = $derived(sessionNudge.stars);

  function open() {
    void goto("/session");
  }
</script>

{#if showing}
  {#if variant === "rail"}
    <Tooltip label="Plan {sessionNudge.subject}">
      <button
        type="button"
        onclick={open}
        aria-label="Plan {sessionNudge.subject}"
        class="press-sm hoverable relative flex size-[22px] items-center justify-center rounded-md text-fg-muted"
      >
        <Sunrise size={14} />
        <!-- The dot is the whole message: something is waiting. The tooltip says what. -->
        <span class="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-danger"></span>
      </button>
    </Tooltip>
  {:else}
    <!-- Above the tab bar rather than over the day headings: the grid's top edge is where the
         month and the week live, and a card there covers the one thing the screen is for. -->
    <div class="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-40 px-3 md:hidden">
      <div
        class="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-xl border border-line bg-surface
          px-2 py-2 shadow-(--shadow-float)"
        transition:fly={{ y: 16, duration: 180 }}
      >
        <button type="button" class="press-sm flex min-w-0 flex-1 items-center gap-2.5 text-left" onclick={open}>
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-fg">
            <Sunrise size={16} />
          </span>
          <span class="min-w-0">
            <span class="t-label block truncate text-fg">Plan {sessionNudge.subject}</span>
            <span class="t-micro block truncate text-fg-muted">
              {stars > 0 ? `Two minutes · +${stars} ★` : "Two minutes"}
            </span>
          </span>
        </button>
        <button
          type="button"
          class="press-sm shrink-0 p-1.5 text-fg-faint"
          aria-label="Not now"
          onclick={() => sessionNudge.dismiss()}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  {/if}
{/if}
