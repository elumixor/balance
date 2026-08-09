<script lang="ts">
  import { swatchPalette, hexToHsl, hslToHex, type Hsl } from "$lib/colors";
  import Popover from "$lib/components/Popover.svelte";
  import { Check } from "lucide-svelte";
  import { Slider } from "bits-ui";

  /**
   * The house palette first, anything else second. The ten swatches are the set that keeps a
   * ring reading as one object; the custom row underneath is there for the category that has
   * to be a particular colour, and it takes either the HSL sliders or a typed hex.
   */
  let { color, taken, onchange }: { color: string; taken: string[]; onchange: (color: string) => void } = $props();

  let hex = $state(color);
  let hsl = $state(hexToHsl(color));

  // The row's colour can also change from outside this panel — a preset tap, or an undone edit.
  $effect(() => {
    hex = color;
    hsl = hexToHsl(color);
  });

  const HEX = /^#[0-9a-f]{6}$/i;

  /** Accepts "1b9e77", "#1B9E77" and the three-digit shorthand; anything else is still being typed. */
  function edit(next: string) {
    hex = next;
    const trimmed = next.trim().replace(/^#/, "");
    const full = trimmed.length === 3 ? trimmed.replace(/./g, (c) => c + c) : trimmed;
    if (HEX.test(`#${full}`)) onchange(`#${full.toLowerCase()}`);
  }

  function setChannel(channel: keyof Hsl, value: number) {
    hsl = { ...hsl, [channel]: value };
    onchange(hslToHex(hsl));
  }

  const isCustom = $derived(!swatchPalette.some((swatch) => swatch.toLowerCase() === color.toLowerCase()));

  const CHANNELS: { key: keyof Hsl; label: string; max: number; gradient: (hsl: Hsl) => string }[] = [
    {
      key: "h",
      label: "Hue",
      max: 360,
      gradient: () =>
        `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((h) => hslToHex({ h, s: 100, l: 50 })).join(", ")})`,
    },
    {
      key: "s",
      label: "Saturation",
      max: 100,
      gradient: (v) => `linear-gradient(to right, ${hslToHex({ ...v, s: 0 })}, ${hslToHex({ ...v, s: 100 })})`,
    },
    {
      key: "l",
      label: "Lightness",
      max: 100,
      gradient: (v) => `linear-gradient(to right, #000000, ${hslToHex({ ...v, l: 50 })}, #ffffff)`,
    },
  ];
</script>

<Popover width={236} align="start">
  {#snippet trigger(open: () => void)}
    <button
      type="button"
      onclick={open}
      aria-label="Change colour"
      class="press-sm size-8 shrink-0 rounded-md border border-line/60 transition-shadow hover:ring-2 hover:ring-fg/10"
      style="background:{color}"
    ></button>
  {/snippet}

  {#snippet content(close: () => void)}
    <div class="p-3">
      <div class="grid grid-cols-5 gap-2">
        {#each swatchPalette as swatch (swatch)}
          {@const selected = swatch.toLowerCase() === color.toLowerCase()}
          <button
            type="button"
            aria-label="Use colour {swatch}"
            aria-pressed={selected}
            onclick={() => {
              onchange(swatch);
              close();
            }}
            class="press-sm flex size-8 items-center justify-center rounded-md transition-shadow
              {selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'hover:ring-2 hover:ring-fg/15'}"
            style="background:{swatch};opacity:{taken.includes(swatch) && !selected ? 0.4 : 1}"
          >
            {#if selected}<Check size={14} color="#fff" strokeWidth={3} />{/if}
          </button>
        {/each}
      </div>

      <!-- Faded swatches are already spoken for by another category; they still work if you want a pair. -->
      <p class="t-micro mt-2.5 text-fg-faint">Faded colours are already used.</p>

      <div class="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <div
          class="size-8 shrink-0 rounded-md border border-line/60
            {isCustom ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}"
          style="background:{color}"
          aria-hidden="true"
        ></div>

        <input
          value={hex}
          oninput={(e) => edit(e.currentTarget.value)}
          spellcheck="false"
          autocomplete="off"
          aria-label="Colour hex"
          class="t-data h-9 w-full rounded-md border border-line bg-surface px-2 uppercase transition-[border-color,box-shadow]
            duration-150 hover:border-line-strong focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none"
        />
      </div>

      <div class="mt-3 space-y-3">
        {#each CHANNELS as channel (channel.key)}
          <Slider.Root
            type="single"
            value={hsl[channel.key]}
            min={0}
            max={channel.max}
            step={1}
            onValueChange={(v) => setChannel(channel.key, v)}
            class="relative flex h-4 w-full touch-none select-none items-center"
          >
            {#snippet children()}
              <span
                class="relative h-2 w-full grow overflow-hidden rounded-full border border-line/60"
                style="background:{channel.gradient(hsl)}"
              ></span>
              <Slider.Thumb
                index={0}
                aria-label={channel.label}
                class="block size-4 shrink-0 rounded-full border border-line bg-surface transition-[box-shadow]
                  duration-150 focus-visible:ring-2 focus-visible:ring-fg/20 focus-visible:outline-none"
              />
            {/snippet}
          </Slider.Root>
        {/each}
      </div>
    </div>
  {/snippet}
</Popover>
