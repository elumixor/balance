<script lang="ts">
  import { hueOf, withHue } from "$lib/ui/colors";
  import { CategoryIcon, IconGrid, Popover } from "$lib/components";
  import { iconFor } from "$lib/ui/icons/index";
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

  const hueTrack = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
    .map((h) => withHue("#c4553b", h))
    .join(", ")})`;

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
      <IconGrid {icon} {taken} {color} {shown} onpick={(name) => onchange({ icon: name })} />

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
