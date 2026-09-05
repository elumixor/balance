<script lang="ts">
  import { Star } from "lucide-svelte";

  /**
   * The one star. Every star in the app — on the badge, in a payout, in a rating, beside a rank —
   * is this glyph, so they read as one thing repeated rather than a handful of similar shapes.
   *
   * Ink, not gold: the app keeps its chrome achromatic so the only hue on screen is the person's
   * own spheres, and a star is chrome. Lit is a filled star in ink; unlit is the same outline
   * on the line colour, so a row of them stays the same width whatever is lit.
   */
  let {
    size = 14,
    lit = true,
    class: klass = "",
  }: {
    size?: number;
    lit?: boolean;
    class?: string;
  } = $props();
</script>

<Star
  {size}
  fill={lit ? "currentColor" : "none"}
  strokeWidth={lit ? 1.5 : 1.75}
  class="shrink-0 {lit ? 'text-ink' : 'text-line-strong'} {klass}"
  aria-hidden="true"
/>
