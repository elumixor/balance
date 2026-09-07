<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Every button in the app, in one place: an icon, a label, or both. `bare` is the quiet one the
   * corners use — no ground until it is pointed at — and it is the same control whether it is
   * showing a word, a glyph, or both, so a dismiss and a "change all" can't drift apart.
   *
   * Given an `href` it is a link wearing the same clothes, for the one road a click can't take:
   * a file to download.
   */
  type Variant = "solid" | "outline" | "danger" | "bare";

  let {
    label,
    /** Icon-only buttons still need a name to be read out; a labelled one already has its own. */
    title,
    onclick,
    href,
    download = false,
    variant = "solid",
    size = "md",
    disabled = false,
    loading = false,
    /** A button element sizes to its label unless told otherwise; primary actions fill their column. */
    full = false,
    icon,
    class: klass = "",
  }: {
    label?: string;
    title?: string;
    onclick?: () => void;
    href?: string;
    download?: boolean;
    variant?: Variant;
    size?: "md" | "sm";
    disabled?: boolean;
    loading?: boolean;
    full?: boolean;
    icon?: Snippet;
    class?: string;
  } = $props();

  const bare = $derived(variant === "bare");
  const fill = $derived(
    variant === "solid" ? "bg-ink text-ink-fg" : variant === "danger" ? "bg-danger text-ink-fg" : "text-fg",
  );
  const padding = $derived(
    bare ? (label ? "px-2 py-1.5" : "p-1.5") : size === "sm" ? "px-3 py-2" : "px-4 py-3",
  );
  const shape = $derived(
    bare
      ? "bare-button"
      : `press flex items-center justify-center gap-2 rounded-md border ${
          variant === "outline" ? "border-line-strong" : "border-transparent"
        } ${fill}`,
  );
  const classes = $derived(`${shape} ${padding} ${full ? "w-full" : ""} ${klass}`);
</script>

{#snippet inside()}
  {#if loading}
    <span
      class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
      aria-hidden="true"
    ></span>
  {:else if icon}
    {@render icon()}
  {/if}
  {#if label}
    <span class={size === "sm" || bare ? "t-label" : "t-body-strong"}>{label}</span>
  {/if}
{/snippet}

{#if href}
  <a {href} download={download ? "" : undefined} aria-label={title ?? label} title={title ?? undefined} class={classes}>
    {@render inside()}
  </a>
{:else}
  <button
    type="button"
    {onclick}
    disabled={disabled || loading}
    aria-label={title ?? label}
    title={title ?? undefined}
    aria-busy={loading}
    class={classes}
  >
    {@render inside()}
  </button>
{/if}
