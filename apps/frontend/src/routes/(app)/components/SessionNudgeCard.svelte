<script lang="ts">
  import { goto } from "$app/navigation";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { Sunrise, X } from "lucide-svelte";

  /**
   * The sitting, asking — one card in the corner's pile.
   *
   * It reads like a problem card because it is the same kind of thing: something the app has to
   * say while you are looking at something else. What it pays, and a way to say not now, after
   * which the same ask waits in the inbox behind the avatar with a dot to say so.
   */
  const stars = $derived(sessionNudge.stars);

  function open() {
    void goto("/session");
  }
</script>

<div
  class="flex w-full items-center gap-0.5 rounded-xl border border-line bg-surface py-1.5 pr-1.5 pl-2
    shadow-(--shadow-float)"
>
  <button type="button" class="press-sm flex min-w-0 flex-1 items-center gap-2.5 text-left" onclick={open}>
    <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-fg">
      <Sunrise size={16} />
    </span>
    <span class="min-w-0">
      <span class="t-label block truncate text-fg">Plan {sessionNudge.subject}</span>
      <span class="t-micro block truncate text-fg-muted">
        {stars > 0 ? `+${stars} ★ for two minutes` : "Two minutes"}
      </span>
    </span>
  </button>
  <button
    type="button"
    class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
    aria-label="Not now"
    onclick={() => sessionNudge.dismiss()}
  >
    <X size={16} />
  </button>
</div>
