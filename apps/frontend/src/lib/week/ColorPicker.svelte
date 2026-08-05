<script lang="ts">
  import { swatchPalette } from "$lib/colors";
  import Dot from "$lib/components/Dot.svelte";
  import Popover from "$lib/components/Popover.svelte";

  /** Colours already in use elsewhere are dimmed but still selectable. */
  let { color, taken, onchange }: { color: string; taken: string[]; onchange: (color: string) => void } = $props();
</script>

<Popover width={196} align="start">
  {#snippet trigger(open: () => void)}
    <button
      type="button"
      onclick={open}
      aria-label="Change colour"
      class="press-sm flex size-8 shrink-0 items-center justify-center rounded-md border border-line"
    >
      <Dot {color} size={14} />
    </button>
  {/snippet}

  {#snippet content(close: () => void)}
    <div class="flex flex-wrap gap-2 p-3">
      {#each swatchPalette as swatch (swatch)}
        <button
          type="button"
          aria-label="Use colour {swatch}"
          onclick={() => {
            onchange(swatch);
            close();
          }}
          class="press-sm size-7 rounded-md"
          style="background:{swatch};opacity:{taken.includes(swatch) && swatch !== color
            ? 0.35
            : 1};border:{swatch === color ? '2px solid var(--fg)' : 'none'}"
        ></button>
      {/each}
    </div>
  {/snippet}
</Popover>
