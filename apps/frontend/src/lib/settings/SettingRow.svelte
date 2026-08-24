<script lang="ts">
  import TooltipAnchor from "$lib/components/TooltipAnchor.svelte";
  import type { Icon as IconType } from "lucide-svelte";
  import type { Snippet } from "svelte";

  /**
   * One setting: a glyph, two or three words, and the control that changes it.
   *
   * The sentence explaining it lives on the label's tooltip rather than under the section
   * heading. Explanations set as prose are read once, on the first visit, and are in the way on
   * every visit after that — while the one row you can't remember the meaning of is the one you
   * hover.
   */
  let {
    icon: Icon,
    label,
    /** The sentence the label used to carry. Shown on hover and on keyboard focus. */
    hint,
    /** Dimmed when the setting only means something while another one is on. */
    disabled = false,
    /** For a control too wide to sit beside its label — a row of chips, not a switch. */
    stacked = false,
    control,
  }: {
    icon: typeof IconType;
    label: string;
    hint?: string;
    disabled?: boolean;
    stacked?: boolean;
    control: Snippet;
  } = $props();
</script>

<!-- Inert as well as dimmed: a control that looks off and still answers a tap is a lie about
     which switch is in charge. The section's own switch is in its header, outside these rows. -->
<div
  aria-disabled={disabled}
  class="{stacked ? 'flex-wrap py-1' : ''} flex min-h-9 items-center gap-2.5
    {disabled ? 'pointer-events-none opacity-40' : ''}"
>
  <Icon size={15} class="shrink-0 text-fg-faint" />
  {#if hint}
    <TooltipAnchor>
      <!-- `help` rather than `default`: the cursor is what says there is more to read here. -->
      <span class="t-body cursor-help text-fg">{label}</span>
      {#snippet bubble()}
        <p class="t-micro max-w-60 rounded-md border border-line bg-surface px-2.5 py-1.5 text-fg shadow-float">
          {hint}
        </p>
      {/snippet}
    </TooltipAnchor>
  {:else}
    <span class="t-body text-fg">{label}</span>
  {/if}
  <span class="flex-1"></span>
  <!-- Stacked, the control takes the next line whole rather than being squeezed beside a label. -->
  <div class={stacked ? "w-full" : "contents"}>
    {@render control()}
  </div>
</div>
