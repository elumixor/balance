<script lang="ts" module>
  import type { Suggestion } from "$lib/calendar/title-suggest";
  import type { PurposeRow } from "$lib/projects/purpose-rows";

  export type Item =
    | { kind: "purpose"; row: PurposeRow }
    | { kind: "create"; name: string }
    | { kind: "token"; suggestion: Suggestion };
</script>

<script lang="ts">
  import { Dot } from "$lib/components";
  import { CalendarClock, Hourglass, Plus, Repeat } from "lucide-svelte";

  /**
   * The list under the title while a pill is being typed: projects and practices by name, and
   * what the words could mean as a day, a time or a length. It leaves the card it was opened
   * from — the card animates a transform, which would pin a fixed panel to the card's box.
   */
  let {
    items,
    active = $bindable(),
    anchor,
    onpick,
  }: {
    items: readonly Item[];
    active: number;
    /** The editor the list hangs under. */
    anchor: HTMLElement;
    onpick: (item: Item) => void;
  } = $props();

  const GAP = 4;
  const MAX_HEIGHT = 240;
  const MARGIN = 12;

  let list = $state<HTMLElement>();
  let style = $state("");

  /** Under the editor, or above it when the bottom of the screen is closer than the list is tall. */
  $effect(() => {
    void items.length;
    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - MARGIN;
    const vertical =
      below < MAX_HEIGHT && rect.top > below
        ? `bottom:${Math.round(window.innerHeight - rect.top + GAP)}px`
        : `top:${Math.round(rect.bottom + GAP)}px`;
    style = `left:${Math.round(rect.left)}px;width:${Math.round(rect.width)}px;max-height:${MAX_HEIGHT}px;${vertical}`;
  });

  $effect(() => {
    list?.children[active]?.scrollIntoView({ block: "nearest" });
  });

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<div
  use:portal
  bind:this={list}
  data-popup-layer
  role="listbox"
  class="fade-in fixed z-50 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-(--shadow-float)"
  {style}
>
  {#each items as item, i (i)}
    <button
      type="button"
      role="option"
      aria-selected={i === active}
      onpointerdown={(e) => {
        // The editor keeps focus: losing it would commit the line before the pill is in it.
        e.preventDefault();
        onpick(item);
      }}
      onpointermove={() => (active = i)}
      class="t-body flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left {i === active ? 'bg-surface-alt' : ''}"
    >
      {#if item.kind === "purpose"}
        {#if item.row.practice}
          <Repeat size={12} style="color:{item.row.color}" />
        {:else}
          <span class="flex w-3 justify-center"><Dot color={item.row.color} /></span>
        {/if}
        <span class="flex-1 truncate text-fg">{item.row.name}</span>
        <span class="t-micro text-fg-faint">{item.row.practice ? "Practice" : "Project"}</span>
      {:else if item.kind === "create"}
        <span class="flex w-3 justify-center"><Plus size={12} /></span>
        <span class="flex-1 truncate text-fg-muted">New project “{item.name}”</span>
      {:else}
        <span class="flex w-3 justify-center text-fg-muted">
          {#if item.suggestion.kind === "dur"}
            <Hourglass size={12} />
          {:else}
            <CalendarClock size={12} />
          {/if}
        </span>
        <span class="flex-1 truncate text-fg">{item.suggestion.label}</span>
        <span class="t-micro text-fg-faint">{item.suggestion.detail}</span>
      {/if}
    </button>
  {/each}
</div>
