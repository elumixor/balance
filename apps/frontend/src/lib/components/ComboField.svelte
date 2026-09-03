<script lang="ts" module>
  export interface ComboOption<T> {
    readonly key: string;
    readonly label: string;
    readonly hint?: string;
    readonly value: T;
  }
</script>

<script lang="ts" generics="T">
  import type { Snippet } from "svelte";

  /**
   * A field that is typed into and picked from at once.
   *
   * The text is the question; the list under it is every answer that fits, each with a hint
   * beside it saying what taking it would mean — a zone with its offset, a lead with its long
   * form. Arrow keys walk the list, Enter takes the highlighted row, and typing something no row
   * matches can still be an answer, which is what `onfree` is for. The parent owns the list: it
   * reads the bound text and says what fits.
   */
  let {
    value = $bindable(""),
    options,
    placeholder,
    ariaLabel,
    autofocus = false,
    width = 240,
    onpick,
    /** Enter on text that isn't in the list. Left out, such text is simply not an answer. */
    onfree,
    /** What a row looks like, when a label and a hint aren't enough — a category with its icon. */
    row,
    /** "bare" is a field in a card row; "boxed" a form control on its own surface. */
    variant = "boxed",
    class: klass = "",
  }: {
    value: string;
    options: readonly ComboOption<T>[];
    placeholder?: string;
    ariaLabel: string;
    autofocus?: boolean;
    width?: number;
    onpick: (option: ComboOption<T>) => void;
    onfree?: (text: string) => void;
    row?: Snippet<[ComboOption<T>, boolean]>;
    variant?: "boxed" | "bare";
    class?: string;
  } = $props();

  const MENU_MAX_HEIGHT = 280;
  const GAP = 6;
  const MARGIN = 12;

  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  let open = $state(false);
  let highlighted = $state(0);
  let position = $state<{ left: number; top: number } | null>(null);

  const shown = $derived(open && options.length > 0);

  // A fresh list starts at the top; what was highlighted in the last one means nothing in this.
  $effect(() => {
    options;
    highlighted = 0;
  });

  $effect(() => {
    if (!shown) return;
    list?.children[highlighted]?.scrollIntoView({ block: "nearest" });
  });

  $effect(() => {
    if (!autofocus) return;
    // The card holding this can spend its first frames hidden, and a hidden field can't take focus.
    const focus = () => {
      input?.focus({ preventScroll: true });
      if (input?.isConnected && document.activeElement !== input) requestAnimationFrame(focus);
    };
    focus();
  });

  /** Below the field when the list fits there, above it otherwise. */
  function place() {
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const below = rect.bottom + GAP;
    const fitsBelow = below + MENU_MAX_HEIGHT <= window.innerHeight - MARGIN;
    position = {
      left: Math.min(Math.max(MARGIN, rect.left), window.innerWidth - width - MARGIN),
      top: fitsBelow ? below : Math.max(MARGIN, rect.top - GAP - MENU_MAX_HEIGHT),
    };
  }

  function show() {
    place();
    open = true;
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    open = false;
    onpick(option);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) show();
      else if (options.length > 0) highlighted = (highlighted + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      return;
    }
    // Enter and Escape belong to this field while it has something to say: the card behind it
    // handles both too, and would otherwise save or close on the press meant to answer this.
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (shown) choose(highlighted);
      else if (value.trim() && onfree) onfree(value.trim());
      return;
    }
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      open = false;
    }
  }

  $effect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  });

  /** The list belongs to the page: inside the card it would be clipped by the card's own scroll. */
  function layer(node: HTMLElement) {
    document.body.appendChild(node);
    return () => node.remove();
  }
</script>

<input
  bind:this={input}
  bind:value
  oninput={() => {
    if (!open) show();
  }}
  onfocus={show}
  onblur={() => (open = false)}
  {onkeydown}
  {placeholder}
  aria-label={ariaLabel}
  autocomplete="off"
  autocapitalize="off"
  spellcheck="false"
  class="t-label w-full {variant === 'bare'
    ? 'field-bare'
    : 'h-10 rounded-md border border-line bg-surface px-3 text-fg transition-[border-color,box-shadow] duration-150 placeholder:text-fg-faint hover:border-line-strong focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none'} {klass}"
/>

{#if shown && position}
  <!-- Pressing a row must not blur the field first, or the list is gone before the press lands. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <ul
    {@attach layer}
    bind:this={list}
    data-popup-layer
    onpointerdown={(e) => e.preventDefault()}
    class="float-in fixed z-50 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-(--shadow-float)"
    style="left:{position.left}px;top:{position.top}px;width:{width}px;max-height:{MENU_MAX_HEIGHT}px"
  >
    {#each options as option, i (option.key)}
      <li>
        <button
          type="button"
          onclick={() => choose(i)}
          onpointermove={() => (highlighted = i)}
          class="hoverable flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left
            {i === highlighted ? 'bg-surface-alt' : ''}"
        >
          {#if row}
            {@render row(option, i === highlighted)}
          {:else}
            <span class="t-label min-w-0 flex-1 truncate text-fg">{option.label}</span>
            {#if option.hint}
              <span class="t-micro shrink-0 text-fg-muted">{option.hint}</span>
            {/if}
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}
