<script lang="ts">
  import type { Snippet } from "svelte";

  type Variant = "solid" | "outline" | "danger";

  let {
    label,
    onclick,
    variant = "solid",
    size = "md",
    disabled = false,
    loading = false,
    /** A button element sizes to its label unless told otherwise; primary actions fill their column. */
    full = false,
    icon,
    class: klass = "",
  }: {
    label: string;
    onclick: () => void;
    variant?: Variant;
    size?: "md" | "sm";
    disabled?: boolean;
    loading?: boolean;
    full?: boolean;
    icon?: Snippet;
    class?: string;
  } = $props();

  const fill = $derived(
    variant === "solid" ? "bg-ink text-ink-fg" : variant === "danger" ? "bg-danger text-ink-fg" : "text-fg",
  );
</script>

<button
  type="button"
  {onclick}
  disabled={disabled || loading}
  aria-label={label}
  aria-busy={loading}
  class="press flex items-center justify-center gap-2 rounded-md border {full ? 'w-full' : ''} {variant === 'outline'
    ? 'border-line-strong'
    : 'border-transparent'} {fill} {size === 'sm' ? 'px-3 py-2' : 'px-4 py-3'} {klass}"
>
  {#if loading}
    <span
      class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
      aria-hidden="true"
    ></span>
  {:else if icon}
    {@render icon()}
  {/if}
  <span class={size === "sm" ? "t-label" : "t-body-strong"}>{label}</span>
</button>
