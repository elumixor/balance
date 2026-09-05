<script lang="ts">
  import { X } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import { viewport } from "$lib/viewport.svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";

  /**
   * A centred panel over a dimmed page, for the one thing in the app that isn't the week:
   * settings. Everything smaller is a popover — this exists because a popover anchored to an
   * 18px avatar is the wrong shape for four sections of content.
   */
  let {
    title,
    open,
    onclose,
    /**
     * "md" is a form — a title bar, padding, a column of controls.
     * "split" is a panel that owns its own inside: a rail of pages down one side, one page at a
     * time beside it. It gets no padding and no title bar, only the close button, because the
     * page it is showing already says what it is.
     */
    size = "md",
    children,
  }: { title: string; open: boolean; onclose: () => void; size?: "md" | "split"; children: Snippet } = $props();

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
  <!-- A sheet on a phone, rising from the bottom edge and keeping its last row above the home
       indicator; a centred panel from `sm` up. -->
  <div
    class="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-overlay-strong backdrop-blur-sm
      backdrop-saturate-50 sm:items-start sm:p-4 {size === 'split' ? 'sm:pt-[5vh]' : 'sm:pt-[6vh]'}"
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
      transition:fly={{ duration: 260, y: viewport.sm ? 0 : 400, easing: cubicOut }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
      class="relative flex max-h-[calc(100dvh-var(--safe-top)-24px)] w-full flex-col overflow-hidden rounded-t-2xl
        border border-line bg-surface shadow-float outline-none max-sm:safe-bottom sm:max-h-none sm:rounded-lg
        {size === 'split' ? 'max-w-4xl' : 'max-w-md'}"
    >
      <div class="sheet-handle sm:hidden"></div>
      {#if size === "split"}
        <!-- Floated over the page rather than sitting in a bar of its own: a title bar above a rail
             that already names every page would be the same word twice. -->
        <button
          type="button"
          onclick={onclose}
          aria-label="Close"
          class="press-sm hoverable absolute top-3 right-3 z-10 flex size-7 items-center justify-center
            rounded-md text-fg-muted"
        >
          <X size={16} />
        </button>
        {@render children()}
      {:else}
        <header class="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 class="t-heading">{title}</h2>
          <button
            type="button"
            onclick={onclose}
            aria-label="Close"
            class="press-sm hoverable flex size-7 items-center justify-center rounded-md text-fg-muted"
          >
            <X size={16} />
          </button>
        </header>
        <div class="min-h-0 space-y-6 overflow-y-auto px-5 py-5">
          {@render children()}
        </div>
      {/if}
    </div>
  </div>
{/if}
