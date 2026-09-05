<script lang="ts">
  import StarGlyph from "./StarGlyph.svelte";

  /**
   * A number of stars, inline: "+7" and the glyph, sized to the text it sits in. What a sitting
   * pays, what a week earned, what finishing paid — every count in the app is this, so the star
   * never has to be typed as a character that renders differently on every platform.
   */
  let {
    value,
    /** Show a sign: "+7" for a payout, plain "7" for a total. */
    signed = true,
    size = 12,
    class: klass = "",
  }: { value: number; signed?: boolean; size?: number; class?: string } = $props();

  const text = $derived(signed && value > 0 ? `+${value}` : `${value}`);
</script>

<span class="inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums {klass}">
  {text}
  <StarGlyph {size} />
</span>
