<script lang="ts" generics="T extends string | number">
  import { ChevronDown } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import Popover from "./Popover.svelte";
  import PopoverItem from "./PopoverItem.svelte";

  /**
   * One of a handful of named answers.
   *
   * The app's own panel rather than `<select>`: a system select renders as the platform's own
   * control — a different type face, a different focus ring, a full-screen wheel on iOS — which
   * is exactly what the rest of the app has spent its time not looking like.
   */
  let {
    options,
    value,
    label,
    /** Faint trailing words that belong to the value: "4 hours *before meeting*". */
    suffix,
    /** Shown faint while nothing is chosen. */
    placeholder = "",
    width = 200,
    /** Fills its column, and the list opens as wide as the field. */
    full = false,
    /** "bare" sits in a row and shows its ground only when pointed at, like a bare field. */
    variant = "boxed",
    onchange,
    /** Rows under the options that do something rather than become the value — "Connect another…". */
    actions,
  }: {
    options: { value: T; label: string }[];
    value: T;
    label: string;
    suffix?: string;
    placeholder?: string;
    width?: number;
    full?: boolean;
    variant?: "boxed" | "bare";
    onchange: (value: T) => void;
    actions?: Snippet<[() => void]>;
  } = $props();

  /** Past this a list scrolls inside the panel rather than running off the screen. */
  const LIST_MAX_HEIGHT = 288;

  const shown = $derived(options.find((option) => option.value === value)?.label ?? "");
  let measured = $state(0);
  const panelWidth = $derived(full && measured ? measured : width);
</script>

<div bind:clientWidth={measured} class={full ? "w-full" : "contents"}>
  <Popover width={panelWidth} align="start">
    {#snippet trigger(open)}
      <button
        type="button"
        onclick={open}
        aria-label={label}
        style={variant === "boxed" && !full ? `min-width:${width}px` : undefined}
        class="{variant === 'boxed' ? 'field-boxed' : 'field-bare'} press-sm flex items-center gap-2 text-left
          {full ? 'w-full' : ''}"
      >
        <span class="flex-1 truncate">
          {#if shown}
            {shown}{#if suffix}<span class="text-fg-faint"> {suffix}</span>{/if}
          {:else}
            <span class="text-fg-faint">{placeholder}</span>
          {/if}
        </span>
        <ChevronDown size={15} class="shrink-0 text-fg-faint" />
      </button>
    {/snippet}

    {#snippet content(close)}
      <div class="overflow-y-auto" style="max-height:{LIST_MAX_HEIGHT}px">
        {#each options as option (option.value)}
          <PopoverItem
            label={option.label}
            selected={option.value === value}
            onclick={() => {
              onchange(option.value);
              close();
            }}
          />
        {/each}
      </div>
      {#if actions}
        <div class="border-t border-line">{@render actions(close)}</div>
      {/if}
    {/snippet}
  </Popover>
</div>
