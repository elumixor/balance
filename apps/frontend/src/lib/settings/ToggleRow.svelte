<script lang="ts">
  import Switch from "$lib/components/Switch.svelte";

  /**
   * A setting that is on or off.
   *
   * The switch leads and the words follow, which is the opposite of the label-then-far-right-switch
   * this panel used to have. A column of switches all in the same place is scannable — you can see
   * what is on without reading anything — and the label stops being a line with a hole in it.
   */
  let {
    label,
    checked,
    /** One faint line where the label alone doesn't say enough. Most rows need none. */
    note,
    disabled = false,
    onchange,
  }: {
    label: string;
    checked: boolean;
    note?: string;
    disabled?: boolean;
    onchange: (checked: boolean) => void;
  } = $props();
</script>

<div class="flex items-start gap-3 {disabled ? 'pointer-events-none opacity-40' : ''}">
  <span class="pt-0.5">
    <Switch {checked} {label} {disabled} {onchange} />
  </span>
  <div class="min-w-0 flex-1">
    <!-- The words are part of the switch: a label you can't hit is a target the size of a thumbnail. -->
    <button type="button" onclick={() => onchange(!checked)} tabindex="-1" class="t-body block text-left text-fg">
      {label}
    </button>
    {#if note}<p class="t-micro mt-0.5 text-fg-faint">{note}</p>{/if}
  </div>
</div>
