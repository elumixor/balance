<script lang="ts">
  import { iconFor, iconLabel, searchIcons } from "$lib/icons";

  /**
   * Every glyph the app has, searched and picked. The category picker draws a hue slider under
   * it and a place picker nothing at all, so the grid is its own thing and both open onto it.
   */
  let {
    icon,
    taken = [],
    color,
    onpick,
    shown = true,
  }: {
    /** The one currently worn. */
    icon: string;
    /** Icons already spoken for elsewhere — faded, but still pickable. */
    taken?: string[];
    /** The chosen tile's tint; the app's ink when the thing has no colour of its own. */
    color?: string;
    onpick: (icon: string) => void;
    /** True once the panel around the grid is placed and showing, which is when the box can take focus. */
    shown?: boolean;
  } = $props();

  let query = $state("");
  const results = $derived(searchIcons(query));

  /**
   * The panel opens to a full grid — the search box is where you'd start typing anyway. It's
   * unpositioned and invisible for its first frames though, and a field in that state can't take
   * focus, so this waits to be told the panel is actually placed.
   */
  function autofocus(node: HTMLInputElement, ready: boolean) {
    if (ready) node.focus({ preventScroll: true });
    return { update: (ready: boolean) => ready && node.focus({ preventScroll: true }) };
  }
</script>

<input
  use:autofocus={shown}
  bind:value={query}
  placeholder="Search icons"
  spellcheck="false"
  autocomplete="off"
  aria-label="Search icons"
  class="field-boxed w-full shrink-0"
/>

<!-- Tall enough to scan, short enough that whatever sits under it stays in view. -->
<div class="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto">
  {#each results as name (name)}
    {@const Icon = iconFor(name)}
    {@const selected = name === icon}
    <button
      type="button"
      aria-label="Use the {iconLabel(name)} icon"
      aria-pressed={selected}
      onclick={() => onpick(name)}
      class="press-sm flex size-9 items-center justify-center rounded-md transition-colors
        {selected ? (color ? 'text-fg' : 'bg-ink text-ink-fg') : 'text-fg-muted hover:bg-fg/5'}"
      style={selected && color
        ? `background:color-mix(in srgb, ${color} 18%, transparent);color:${color}`
        : `opacity:${taken.includes(name) ? 0.35 : 1}`}
    >
      <Icon size={18} />
    </button>
  {/each}

  {#if results.length === 0}
    <p class="t-micro col-span-6 py-6 text-center text-fg-faint">No icon by that name.</p>
  {/if}
</div>
