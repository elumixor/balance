<script lang="ts">
  import { hueOf, withAlpha, withHue } from "$lib/colors";
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import { iconFor, iconLabel, searchIcons } from "$lib/icons";
  import { Slider } from "bits-ui";

  /**
   * What a category looks like, decided in one place: the shape it wears and the hue it wears it
   * in. Only the hue moves — saturation and lightness stay where the palette put them, so no
   * category can be tuned into something that breaks the ring it sits in.
   */
  let {
    icon,
    color,
    taken,
    onchange,
    variant = "chip",
    size,
  }: {
    icon: string;
    color: string;
    /** Icons already spoken for by another category — faded, but still pickable. */
    taken: string[];
    onchange: (patch: { icon?: string; color?: string }) => void;
    /** "bare" is the icon as it's already drawn on the ring — the slice is its own trigger. */
    variant?: "chip" | "bare";
    size?: number;
  } = $props();

  const hue = $derived(hueOf(color));
  const Trigger = $derived(iconFor(icon));
  /** A chip is a tile around the glyph; bare is the glyph itself, at the size the ring drew it. */
  const box = $derived(size ?? (variant === "bare" ? 18 : 32));

  let query = $state("");
  const results = $derived(searchIcons(query));

  const hueTrack = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
    .map((h) => withHue("#c4553b", h))
    .join(", ")})`;

  /**
   * The panel opens to a full grid — the search box is where you'd start typing anyway. It's
   * unpositioned and invisible for its first frames though, and a field in that state can't take
   * focus, so this waits for Popover to say the panel is actually placed and showing.
   */
  function autofocus(node: HTMLInputElement, shown: boolean) {
    if (shown) node.focus({ preventScroll: true });
    return { update: (shown: boolean) => shown && node.focus({ preventScroll: true }) };
  }
</script>

<Popover width={268} align="start">
  {#snippet trigger(open: () => void)}
    {#if variant === "bare"}
      <button
        type="button"
        onclick={open}
        aria-label="Change icon and colour"
        class="press-sm flex size-full items-center justify-center rounded-full text-white"
      >
        <Trigger size={box} strokeWidth={2.25} />
      </button>
    {:else}
      <button
        type="button"
        onclick={open}
        aria-label="Change icon and colour"
        class="press-sm rounded-md transition-shadow hover:ring-2 hover:ring-fg/10"
      >
        <CategoryIcon {icon} {color} size={box} />
      </button>
    {/if}
  {/snippet}

  {#snippet content(_close, shown)}
    <div class="flex flex-col gap-3 p-3">
      <input
        use:autofocus={shown}
        bind:value={query}
        placeholder="Search icons"
        spellcheck="false"
        autocomplete="off"
        aria-label="Search icons"
        class="t-body h-9 w-full shrink-0 rounded-md border border-line bg-surface px-2.5
          transition-[border-color,box-shadow] duration-150 placeholder:text-fg-faint hover:border-line-strong
          focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none"
      />

      <!-- Tall enough to scan, short enough that the hue slider stays in view under it. -->
      <div class="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto">
        {#each results as name (name)}
          {@const Icon = iconFor(name)}
          {@const selected = name === icon}
          <button
            type="button"
            aria-label="Use the {iconLabel(name)} icon"
            aria-pressed={selected}
            onclick={() => onchange({ icon: name })}
            class="press-sm flex size-9 items-center justify-center rounded-md transition-colors
              {selected ? 'text-fg' : 'text-fg-muted hover:bg-fg/5'}"
            style={selected
              ? `background:${withAlpha(color, 0.18)};color:${color}`
              : `opacity:${taken.includes(name) ? 0.35 : 1}`}
          >
            <Icon size={18} />
          </button>
        {/each}

        {#if results.length === 0}
          <p class="t-micro col-span-6 py-6 text-center text-fg-faint">No icon by that name.</p>
        {/if}
      </div>

      <div class="border-t border-line pt-3">
        <Slider.Root
          type="single"
          value={hue}
          min={0}
          max={360}
          step={1}
          onValueChange={(h) => onchange({ color: withHue(color, h) })}
          class="relative flex h-4 w-full touch-none select-none items-center"
        >
          {#snippet children()}
            <span
              class="relative h-2 w-full grow overflow-hidden rounded-full border border-line/60"
              style="background:{hueTrack}"
            ></span>
            <Slider.Thumb
              index={0}
              aria-label="Hue"
              class="block size-4 shrink-0 rounded-full border border-line bg-surface transition-[box-shadow]
                duration-150 focus-visible:ring-2 focus-visible:ring-fg/20 focus-visible:outline-none"
            />
          {/snippet}
        </Slider.Root>
      </div>
    </div>
  {/snippet}
</Popover>
