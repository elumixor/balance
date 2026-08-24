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
    onchange,
  }: {
    options: { value: T; label: string }[];
    value: T;
    label: string;
    suffix?: string;
    width?: number;
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
      style="min-width:{width}px"
      class="press-sm flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-left
        transition-colors duration-150 hover:border-line-strong"
    >
      <span class="t-body flex-1 truncate text-fg">
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
