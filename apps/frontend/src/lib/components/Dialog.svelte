<script lang="ts">
  import { X } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import { fade, scale } from "svelte/transition";

  /**
   * A centred panel over a dimmed page, for the one thing in the app that isn't the week:
   * settings. Everything smaller is a popover — this exists because a popover anchored to an
   * 18px avatar is the wrong shape for four sections of content.
   */
  let {
    title,
    open,
    onclose,
    /** "md" is a form; "lg" is a panel that lays its sections out in two columns on a wide screen. */
    size = "md",
    children,
  }: { title: string; open: boolean; onclose: () => void; size?: "md" | "lg"; children: Snippet } = $props();

  let panel = $state<HTMLElement>();

  // Opening moves focus in, so Escape and Tab reach the panel rather than whatever is behind it.
  $effect(() => {
    if (open) panel?.focus();
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if (open && e.key === "Escape") onclose();
  }}
/>

{#if open}
  <!-- The backdrop closes on click; the panel stops the click reaching it, which is what lets a
       drag that starts inside the panel end outside it without closing anything. -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-overlay-strong p-4 pt-[6vh]
      backdrop-blur-sm backdrop-saturate-50"
    transition:fade={{ duration: 120 }}
    onclick={onclose}
    onkeydown={() => {}}
    role="presentation"
  >
    <div
      bind:this={panel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      transition:scale={{ duration: 140, start: 0.98 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
      class="w-full {size === 'lg' ? 'max-w-3xl' : 'max-w-md'} rounded-lg border border-line bg-surface
        shadow-float outline-none"
    >
      <header class="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 class="t-heading">{title}</h2>
        <button
          type="button"
          onclick={onclose}
          aria-label="Close"
          class="press-sm flex size-7 items-center justify-center rounded-md text-fg-muted hoverable"
        >
          <X size={16} />
        </button>
      </header>
      <div class="{size === 'lg' ? 'space-y-4' : 'space-y-6'} px-5 py-5">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
