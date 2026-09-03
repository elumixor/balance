<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { Sunrise, X } from "lucide-svelte";
  import { fly } from "svelte/transition";

  /**
   * The sitting, asking. It used to be a tab, which is a permanent invitation to something that is
   * only worth doing twice a day; this appears when it is owed and leaves when it isn't.
   *
   * It is a notification, not a destination, so it doesn't sit among the screens: a card that
   * arrives in the top-right corner on a wide screen, and over the tab bar on a phone, where a
   * corner that small is under the notch. What it pays, and a way to say not now — after which the
   * same ask waits in the inbox behind the avatar, with a dot to say so.
   */
  const showing = $derived(sessionNudge.pending && !page.url.pathname.startsWith("/session"));
  const stars = $derived(sessionNudge.stars);

  function open() {
    void goto("/session");
  }
</script>

{#if showing}
  <!-- Under the strip on a wide screen, above the bar on a phone: neither over the day headings,
       which are the one thing the calendar is for. -->
  <div
    class="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-40 px-3
      md:inset-x-auto md:top-14 md:right-4 md:bottom-auto md:px-0"
  >
    <div
      role="status"
      class="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-xl border border-line bg-surface
        px-2 py-2 shadow-(--shadow-float) md:w-72"
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
