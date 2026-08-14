<script lang="ts">
  import { hueOf, withAlpha, withHue } from "$lib/colors";
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import { iconFor, iconNames } from "$lib/icons";
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
  }: {
    icon: string;
    color: string;
    /** Icons already spoken for by another category — faded, but still pickable. */
    taken: string[];
    onchange: (patch: { icon?: string; color?: string }) => void;
  } = $props();

  const hue = $derived(hueOf(color));

  const hueTrack = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
    .map((h) => withHue("#c4553b", h))
    .join(", ")})`;
</script>

<Popover width={268} align="start">
  {#snippet trigger(open: () => void)}
    <button
      type="button"
      onclick={open}
      aria-label="Change icon and colour"
      class="press-sm rounded-md transition-shadow hover:ring-2 hover:ring-fg/10"
    >
      <CategoryIcon {icon} {color} />
    </button>
  {/snippet}

  {#snippet content()}
    <div class="p-3">
      <div class="grid grid-cols-6 gap-1">
        {#each iconNames as name (name)}
          {@const Icon = iconFor(name)}
          {@const selected = name === icon}
          <button
            type="button"
            aria-label="Use the {name.replace(/-/g, ' ')} icon"
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
      </div>

      <div class="mt-3 border-t border-line pt-3">
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
