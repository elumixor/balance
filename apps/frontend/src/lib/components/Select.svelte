<script lang="ts" generics="T extends string | number">
  import { ChevronDown } from "lucide-svelte";
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
    width = 200,
    /** "bare" sits in a row and shows its ground only when pointed at, like a bare field. */
    variant = "boxed",
    onchange,
  }: {
    options: { value: T; label: string }[];
    value: T;
    label: string;
    suffix?: string;
    width?: number;
    variant?: "boxed" | "bare";
    onchange: (value: T) => void;
  } = $props();

  const shown = $derived(options.find((option) => option.value === value)?.label ?? "");
</script>

<Popover {width} align="start">
  {#snippet trigger(open)}
    <button
      type="button"
      onclick={open}
      aria-label={label}
      style={variant === "boxed" ? `min-width:${width}px` : undefined}
      class="{variant === 'boxed' ? 'field-boxed' : 'field-bare'} press-sm flex items-center gap-2 text-left"
    >
      <span class="flex-1 truncate">
        {shown}{#if suffix}<span class="text-fg-faint"> {suffix}</span>{/if}
      </span>
      <ChevronDown size={15} class="shrink-0 text-fg-faint" />
    </button>
  {/snippet}

  {#snippet content(close)}
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
  {/snippet}
</Popover>
