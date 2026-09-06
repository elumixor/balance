<script lang="ts">
  import { iconFor, PLACE_ICON } from "$lib/ui/icons/index";
  import IconGrid from "./IconGrid.svelte";
  import Popover from "./Popover.svelte";

  let {
    icon,
    label,
    onchange,
    size = 15,
  }: {
    icon: string | undefined;
    /** The place's name, for the button's label. */
    label: string;
    onchange: (icon: string) => void;
    size?: number;
  } = $props();

  const Glyph = $derived(iconFor(icon ?? PLACE_ICON));
</script>

<Popover width={268} align="start">
  {#snippet trigger(open)}
    <button
      type="button"
      onclick={open}
      aria-label="Change the icon of {label}"
      class="bare-button size-7 text-fg-muted"
    >
      <Glyph {size} />
    </button>
  {/snippet}
  {#snippet content(close, shown)}
    <div class="flex flex-col gap-3 p-3">
      <IconGrid
        icon={icon ?? PLACE_ICON}
        {shown}
        onpick={(next) => {
          onchange(next);
          close();
        }}
      />
    </div>
  {/snippet}
</Popover>
